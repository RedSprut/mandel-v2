import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const HTML_PATH=path.join(ROOT,'second_version','index.html');
const CATALOG_PATH=path.join(ROOT,'second_version','i18n-catalog.js');
const RUNTIME_PATH=path.join(ROOT,'second_version','i18n-runtime.js');
const DOWNLOADS_DIR=path.join(path.dirname(ROOT),'Downloads');
const EXPECTED_LOCALES=['ru','en','no','sv','da','fi','de','fr','es','it','pt','pl','nl','et','lv','lt'];
const errors=[];
const fail=message=>errors.push(message);

const html=fs.readFileSync(HTML_PATH,'utf8');
const runtime=fs.readFileSync(RUNTIME_PATH,'utf8');
const catalogSource=fs.readFileSync(CATALOG_PATH,'utf8');
const context={window:{}};
vm.runInNewContext(catalogSource,context,{filename:CATALOG_PATH});
const catalog=context.window.LOTO_I18N_CATALOG;

if(!catalog)fail('Catalog did not initialize window.LOTO_I18N_CATALOG');
const localeCodes=Object.keys(catalog?.locales||{});
if(JSON.stringify(localeCodes)!==JSON.stringify(EXPECTED_LOCALES)){
  fail(`Locale list mismatch: ${localeCodes.join(', ')}`);
}
if((catalog?.entries?.length||0)<1400)fail(`Catalog is unexpectedly small: ${catalog?.entries?.length||0}`);

const sources=new Set();
for(const [index,entry] of (catalog?.entries||[]).entries()){
  if(!Array.isArray(entry)||entry.length!==3){fail(`Malformed catalog entry #${index}`);continue;}
  const [source,sourceLocale,translations]=entry;
  if(sources.has(source))fail(`Duplicate source: ${source}`);
  sources.add(source);
  if(!localeCodes.includes(sourceLocale))fail(`Unknown source locale ${sourceLocale}: ${source}`);
  if(!Array.isArray(translations)||translations.length!==localeCodes.length){
    fail(`Wrong translation count: ${source}`);continue;
  }
  const expectedSlots=[...source.matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
  translations.forEach((translation,localeIndex)=>{
    const locale=localeCodes[localeIndex];
    if(typeof translation!=='string'||!translation.trim())fail(`Empty ${locale} translation: ${source}`);
    const actualSlots=[...String(translation).matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
    if(actualSlots!==expectedSlots)fail(`Placeholder mismatch in ${locale}: ${source}`);
    if(sourceLocale==='ru'&&locale!=='ru'&&/[А-Яа-яЁё]/.test(translation)){
      fail(`Cyrillic remained in ${locale}: ${source} => ${translation}`);
    }
  });
  const sourceIndex=localeCodes.indexOf(sourceLocale);
  if(translations[sourceIndex]!==source)fail(`Source text changed for ${sourceLocale}: ${source}`);
}

const langOrderMatch=html.match(/const LANG_ORDER=\[([^\]]+)\]/);
const htmlLocales=langOrderMatch?.[1]?.match(/['"]([a-z]{2})['"]/g)?.map(value=>value.slice(1,-1))||[];
if(JSON.stringify(htmlLocales)!==JSON.stringify(EXPECTED_LOCALES))fail(`HTML language order mismatch: ${htmlLocales.join(', ')}`);
if(!html.includes('<script src="./i18n-catalog.js"></script>'))fail('index.html does not load i18n-catalog.js');
if(!html.includes('<script src="./i18n-runtime.js"></script>'))fail('index.html does not load i18n-runtime.js');
if(!runtime.includes('MutationObserver'))fail('Runtime does not localize dynamically inserted content');
if(/(?:toLocaleDateString|toLocaleString|Intl\.(?:DateTimeFormat|NumberFormat))\(\s*['"](?:ru-RU|nb-NO)['"]/.test(html)){
  fail('Hard-coded Russian/Norwegian display locale remains in index.html');
}

const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const name of ['index.html','i18n-catalog.js','i18n-runtime.js']){
  const repoFile=path.join(ROOT,'second_version',name);
  const downloadsFile=path.join(DOWNLOADS_DIR,name);
  if(fs.existsSync(downloadsFile)&&hash(repoFile)!==hash(downloadsFile))fail(`Downloads copy is out of sync: ${name}`);
}

if(errors.length){
  console.error(`i18n audit failed (${errors.length}):`);
  errors.slice(0,80).forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}
console.log(`i18n audit passed: ${catalog.entries.length} messages × ${localeCodes.length} locales (${catalog.entries.length*localeCodes.length} values)`);
