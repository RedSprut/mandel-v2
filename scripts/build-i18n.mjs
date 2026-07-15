import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'acorn';

const ROOT=path.resolve(new URL('..',import.meta.url).pathname);
const HTML_PATH=path.join(ROOT,'second_version','index.html');
const OUT_PATH=path.join(ROOT,'second_version','i18n-catalog.js');
const CACHE_PATH=path.join(ROOT,'.i18n-build-cache.json');
const DOWNLOADS_DIR=path.join(path.dirname(ROOT),'Downloads');

const LOCALES={
  ru:{name:'Русский',flag:'🇷🇺'},en:{name:'English',flag:'🇬🇧'},no:{name:'Norsk',flag:'🇳🇴'},
  sv:{name:'Svenska',flag:'🇸🇪'},da:{name:'Dansk',flag:'🇩🇰'},fi:{name:'Suomi',flag:'🇫🇮'},
  de:{name:'Deutsch',flag:'🇩🇪'},fr:{name:'Français',flag:'🇫🇷'},es:{name:'Español',flag:'🇪🇸'},
  it:{name:'Italiano',flag:'🇮🇹'},pt:{name:'Português',flag:'🇵🇹'},pl:{name:'Polski',flag:'🇵🇱'},
  nl:{name:'Nederlands',flag:'🇳🇱'},et:{name:'Eesti',flag:'🇪🇪'},lv:{name:'Latviešu',flag:'🇱🇻'},
  lt:{name:'Lietuvių',flag:'🇱🇹'}
};

const EXTRA_SOURCE={
  ru:['Вся доступная база','{{0}} ({{1}}) — 1 до {{2}}'],
  en:[
    'Language','Theme','Reality Check Simulator','Pure random','Main numbers','Bonus numbers',
    'Norway','Nordic/Baltic','Europe','USA','Italy','Canada','Australia',
    '5 white balls','1 Powerball','1 Mega Ball','5 main numbers','2 Lucky Stars','6 numeri',
    '7 numbers','7 main numbers','Bonus','Lucky Stars','Jackpot','PREMIUM'
  ],
  no:[
    'Fyll ut minst 2 rekker','Mine tall','Velg 7 tall','Velg 6 hovedtall','1 vikingtall',
    'Velg 5 hovedtall','2 stjernetall','Tilleggstall','Vikingtall',
    'Fyll ut rekken','Fyll ut resten','Tøm','Kopier rekker',
    '7 rette','6 + tillegg','6+tillegg','6 rette','5 rette','4 rette','3 rette'
  ]
};

const TERM_OVERRIDES={
  'Главные числа ({{0}}) — 1 до {{1}}': ['Главные числа ({{0}}) — 1 до {{1}}','Main numbers ({{0}}) — 1 to {{1}}','Hovedtall ({{0}}) — 1 til {{1}}','Huvudnummer ({{0}}) — 1 till {{1}}','Hovednumre ({{0}}) — 1 til {{1}}','Päänumerot ({{0}}) — 1–{{1}}','Hauptzahlen ({{0}}) — 1 bis {{1}}','Numéros principaux ({{0}}) — 1 à {{1}}','Números principales ({{0}}) — 1 a {{1}}','Numeri principali ({{0}}) — da 1 a {{1}}','Números principais ({{0}}) — 1 a {{1}}','Liczby główne ({{0}}) — od 1 do {{1}}','Hoofdnummers ({{0}}) — 1 tot {{1}}','Põhinumbrid ({{0}}) — 1 kuni {{1}}','Galvenie skaitļi ({{0}}) — no 1 līdz {{1}}','Pagrindiniai skaičiai ({{0}}) — nuo 1 iki {{1}}'],
  '{{0}} ({{1}}) — 1 до {{2}}': ['{{0}} ({{1}}) — 1 до {{2}}','{{0}} ({{1}}) — 1 to {{2}}','{{0}} ({{1}}) — 1 til {{2}}','{{0}} ({{1}}) — 1 till {{2}}','{{0}} ({{1}}) — 1 til {{2}}','{{0}} ({{1}}) — 1–{{2}}','{{0}} ({{1}}) — 1 bis {{2}}','{{0}} ({{1}}) — 1 à {{2}}','{{0}} ({{1}}) — 1 a {{2}}','{{0}} ({{1}}) — da 1 a {{2}}','{{0}} ({{1}}) — 1 a {{2}}','{{0}} ({{1}}) — od 1 do {{2}}','{{0}} ({{1}}) — 1 tot {{2}}','{{0}} ({{1}}) — 1 kuni {{2}}','{{0}} ({{1}}) — no 1 līdz {{2}}','{{0}} ({{1}}) — nuo 1 iki {{2}}'],
  '— свежие тиражи подтягиваются сами': ['— свежие тиражи подтягиваются сами','— new lottery draws update automatically','— nye lotteritrekninger oppdateres automatisk','— nya lotteridragningar uppdateras automatiskt','— nye lotteritrækninger opdateres automatisk','— uudet lottoarvonnat päivittyvät automaattisesti','— neue Lotterieziehungen werden automatisch aktualisiert','— les nouveaux tirages sont mis à jour automatiquement','— los nuevos sorteos se actualizan automáticamente','— le nuove estrazioni si aggiornano automaticamente','— os novos sorteios são atualizados automaticamente','— nowe losowania są aktualizowane automatycznie','— nieuwe loterijtrekkingen worden automatisch bijgewerkt','— uued loosimised uuendatakse automaatselt','— jaunās izlozes tiek atjauninātas automātiski','— nauji traukimai atnaujinami automatiškai'],
  'Выпавшие главные числа ({{0}} из {{1}})': ['Выпавшие главные числа ({{0}} из {{1}})','Drawn main numbers ({{0}} of {{1}})','Trukne hovedtall ({{0}} av {{1}})','Dragna huvudnummer ({{0}} av {{1}})','Udtrukne hovednumre ({{0}} af {{1}})','Arvotut päänumerot ({{0}}/{{1}})','Gezogene Hauptzahlen ({{0}} von {{1}})','Numéros principaux tirés ({{0}} sur {{1}})','Números principales extraídos ({{0}} de {{1}})','Numeri principali estratti ({{0}} su {{1}})','Números principais sorteados ({{0}} de {{1}})','Wylosowane liczby główne ({{0}} z {{1}})','Getrokken hoofdnummers ({{0}} van {{1}})','Loositud põhinumbrid ({{0}}/{{1}})','Izlozētie galvenie skaitļi ({{0}} no {{1}})','Ištraukti pagrindiniai skaičiai ({{0}} iš {{1}})'],
  '{{0}} ({{1}} из {{2}})': ['{{0}} ({{1}} из {{2}})','{{0}} ({{1}} of {{2}})','{{0}} ({{1}} av {{2}})','{{0}} ({{1}} av {{2}})','{{0}} ({{1}} af {{2}})','{{0}} ({{1}}/{{2}})','{{0}} ({{1}} von {{2}})','{{0}} ({{1}} sur {{2}})','{{0}} ({{1}} de {{2}})','{{0}} ({{1}} su {{2}})','{{0}} ({{1}} de {{2}})','{{0}} ({{1}} z {{2}})','{{0}} ({{1}} van {{2}})','{{0}} ({{1}}/{{2}})','{{0}} ({{1}} no {{2}})','{{0}} ({{1}} iš {{2}})'],
  'χ² с поправкой без возвращения:': ['χ² с поправкой без возвращения:','χ² adjusted for sampling without replacement:','χ² justert for trekking uten tilbakelegging:','χ² justerat för dragning utan återläggning:','χ² justeret for udtrækning uden tilbagelægning:','χ² korjattuna otannalle ilman palautusta:','χ² mit Korrektur für Ziehen ohne Zurücklegen:','χ² corrigé pour un tirage sans remise :','χ² ajustado para muestreo sin reemplazo:','χ² corretto per campionamento senza reinserimento:','χ² ajustado para amostragem sem reposição:','χ² skorygowane dla losowania bez zwracania:','χ² gecorrigeerd voor trekking zonder teruglegging:','χ² korrigeeritud tagasipanekuta valimi jaoks:','χ² koriģēts atlasei bez atlikšanas atpakaļ:','χ² pakoreguotas atrankai be grąžinimo:'],
  'Reality Check Simulator': ['Симулятор проверки реальности','Reality Check Simulator','Realitetssjekk-simulator','Verklighetskontroll-simulator','Realitetstjek-simulator','Todellisuustarkistuksen simulaattori','Reality-Check-Simulator','Simulateur de contrôle de la réalité','Simulador de comprobación de la realidad','Simulatore di verifica della realtà','Simulador de verificação da realidade','Symulator kontroli rzeczywistości','Realitycheck-simulator','Reaalsuskontrolli simulaator','Realitātes pārbaudes simulators','Realybės patikros simuliatorius'],
  '18+ · Симуляция и аналитика. Приложение не продаёт билеты, не принимает ставки и не связано с операторами лотерей, Apple или Google. Названия игр используются только для их идентификации. Отдельные числа могут повторяться; полная основная комбинация в симуляторе не повторяется до завершения цикла. В реальном независимом тираже повтор возможен.': [
    '18+ · Симуляция и аналитика. Приложение не продаёт билеты, не принимает ставки и не связано с операторами лотерей, Apple или Google. Названия игр используются только для их идентификации. Отдельные числа могут повторяться; полная основная комбинация в симуляторе не повторяется до завершения цикла. В реальном независимом тираже повтор возможен.',
    '18+ · Simulation and analytics. The app does not sell tickets, accept wagers, or have any affiliation with lottery operators, Apple, or Google. Game names are used only for identification. Individual numbers may recur; the complete main combination is not repeated by the simulator until its cycle is complete. In a real independent lottery draw, the same combination may occur again.',
    '18+ · Simulering og analyse. Appen selger ikke lodd, tar ikke imot innsatser og er ikke tilknyttet lotterioperatører, Apple eller Google. Spillnavn brukes bare til identifikasjon. Enkelttall kan gjentas; hele hovedkombinasjonen gjentas ikke av simulatoren før syklusen er fullført. I en ekte, uavhengig lotteritrekning kan den samme kombinasjonen forekomme igjen.',
    '18+ · Simulering och analys. Appen säljer inte lotter, tar inte emot insatser och är inte ansluten till lotterioperatörer, Apple eller Google. Spelnamn används endast för identifiering. Enskilda nummer kan återkomma; hela huvudkombinationen upprepas inte av simulatorn förrän cykeln är klar. I en verklig oberoende lotteridragning kan samma kombination förekomma igen.',
    '18+ · Simulering og analyse. Appen sælger ikke billetter, modtager ikke indsatser og er ikke tilknyttet lotterioperatører, Apple eller Google. Spilnavne bruges kun til identifikation. Enkelte tal kan gentages; hele hovedkombinationen gentages ikke af simulatoren, før cyklussen er fuldført. I en reel uafhængig lotteritrækning kan den samme kombination forekomme igen.',
    '18+ · Simulointi ja analytiikka. Sovellus ei myy lippuja, ota vastaan panoksia eikä ole yhteydessä lotto-operaattoreihin, Appleen tai Googleen. Pelien nimiä käytetään vain tunnistamiseen. Yksittäiset numerot voivat toistua; simulaattori ei toista koko pääyhdistelmää ennen kierroksen päättymistä. Todellisessa riippumattomassa lottoarvonnassa sama yhdistelmä voi toistua.',
    '18+ · Simulation und Analyse. Die App verkauft keine Lose, nimmt keine Einsätze an und steht in keiner Verbindung zu Lotteriebetreibern, Apple oder Google. Spielnamen dienen nur der Identifizierung. Einzelne Zahlen können erneut vorkommen; die vollständige Hauptkombination wird vom Simulator erst nach Abschluss des Zyklus wiederholt. Bei einer echten unabhängigen Lotterieziehung kann dieselbe Kombination erneut auftreten.',
    '18+ · Simulation et analyse. L’application ne vend pas de billets, n’accepte aucune mise et n’est affiliée ni aux opérateurs de loterie, ni à Apple, ni à Google. Les noms des jeux servent uniquement à les identifier. Des numéros peuvent se répéter ; le simulateur ne répète pas la combinaison principale complète avant la fin du cycle. Lors d’un tirage réel et indépendant, une même combinaison peut se reproduire.',
    '18+ · Simulación y análisis. La aplicación no vende boletos, no acepta apuestas ni está afiliada a operadores de lotería, Apple o Google. Los nombres de los juegos se usan solo para identificarlos. Los números individuales pueden repetirse; el simulador no repite la combinación principal completa hasta finalizar el ciclo. En un sorteo real e independiente, la misma combinación puede volver a aparecer.',
    '18+ · Simulazione e analisi. L’app non vende biglietti, non accetta scommesse e non è affiliata a operatori della lotteria, Apple o Google. I nomi dei giochi sono usati solo a scopo identificativo. I singoli numeri possono ripetersi; il simulatore non ripete l’intera combinazione principale prima del completamento del ciclo. In un’estrazione reale e indipendente, la stessa combinazione può ripetersi.',
    '18+ · Simulação e análise. O aplicativo não vende bilhetes, não aceita apostas e não é afiliado a operadores de loteria, Apple ou Google. Os nomes dos jogos são usados apenas para identificação. Números individuais podem se repetir; o simulador não repete a combinação principal completa antes do fim do ciclo. Em um sorteio real e independente, a mesma combinação pode voltar a ocorrer.',
    '18+ · Symulacja i analityka. Aplikacja nie sprzedaje losów, nie przyjmuje zakładów i nie jest powiązana z operatorami loterii, Apple ani Google. Nazwy gier służą wyłącznie do identyfikacji. Poszczególne liczby mogą się powtarzać; symulator nie powtarza pełnej kombinacji głównej przed zakończeniem cyklu. W rzeczywistym, niezależnym losowaniu ta sama kombinacja może wystąpić ponownie.',
    '18+ · Simulatie en analyse. De app verkoopt geen loten, neemt geen inzetten aan en is niet verbonden aan loterijexploitanten, Apple of Google. Spelnamen worden uitsluitend ter identificatie gebruikt. Afzonderlijke nummers kunnen terugkeren; de simulator herhaalt de volledige hoofdcombinatie pas nadat de cyclus is voltooid. Bij een echte onafhankelijke loterijtrekking kan dezelfde combinatie opnieuw voorkomen.',
    '18+ · Simulatsioon ja analüüs. Rakendus ei müü pileteid, ei võta vastu panuseid ega ole seotud loteriikorraldajate, Apple’i või Google’iga. Mängude nimesid kasutatakse ainult tuvastamiseks. Üksikud numbrid võivad korduda; simulaator ei korda täielikku põhikombinatsiooni enne tsükli lõppu. Päris sõltumatus loteriiloosimises võib sama kombinatsioon uuesti esineda.',
    '18+ · Simulācija un analītika. Lietotne nepārdod biļetes, nepieņem likmes un nav saistīta ar loteriju operatoriem, Apple vai Google. Spēļu nosaukumi tiek izmantoti tikai identificēšanai. Atsevišķi skaitļi var atkārtoties; simulators neatkārto pilnu galveno kombināciju līdz cikla beigām. Reālā neatkarīgā loterijas izlozē tā pati kombinācija var atkārtoties.',
    '18+ · Modeliavimas ir analizė. Programėlė neparduoda bilietų, nepriima statymų ir nėra susijusi su loterijų operatoriais, „Apple“ ar „Google“. Žaidimų pavadinimai naudojami tik identifikavimui. Atskiri skaičiai gali kartotis; simuliatorius nekartoja viso pagrindinio derinio iki ciklo pabaigos. Tikrame nepriklausomame loterijos traukime tas pats derinys gali pasikartoti.'
  ],
  'Вся доступная база': ['Вся доступная база','Full available archive','Hele det tilgjengelige arkivet','Hela det tillgängliga arkivet','Hele det tilgængelige arkiv','Koko saatavilla oleva arkisto','Vollständiges verfügbares Archiv','Archive complète disponible','Archivo completo disponible','Archivio completo disponibile','Arquivo completo disponível','Pełne dostępne archiwum','Volledig beschikbaar archief','Kogu saadaolev arhiiv','Pilns pieejamais arhīvs','Visas prieinamas archyvas'],
  'тираж':      ['тираж','draw','trekning','dragning','trækning','arvonta','Ziehung','tirage','sorteo','estrazione','sorteio','losowanie','trekking','loosimine','izloze','traukimas'],
  'тиража':     ['тиража','draw','trekning','dragning','trækning','arvonta','Ziehung','tirage','sorteo','estrazione','sorteio','losowanie','trekking','loosimine','izloze','traukimas'],
  'тираже':     ['тираже','draw','trekning','dragning','trækning','arvonta','Ziehung','tirage','sorteo','estrazione','sorteio','losowanie','trekking','loosimine','izloze','traukimas'],
  'тиражу':     ['тиражу','draw','trekning','dragning','trækning','arvonta','Ziehung','tirage','sorteo','estrazione','sorteio','losowanie','trekking','loosimine','izloze','traukimas'],
  'тиражей':    ['тиражей','draws','trekninger','dragningar','trækninger','arvonnat','Ziehungen','tirages','sorteos','estrazioni','sorteios','losowania','trekkingen','loosimised','izlozes','traukimai'],
  'тиражи':     ['тиражи','draws','trekninger','dragningar','trækninger','arvonnat','Ziehungen','tirages','sorteos','estrazioni','sorteios','losowania','trekkingen','loosimised','izlozes','traukimai'],
  'тиражах':    ['тиражах','draws','trekninger','dragningar','trækninger','arvonnoissa','Ziehungen','tirages','sorteos','estrazioni','sorteios','losowaniach','trekkingen','loosimistes','izlozēs','traukimuose'],
  'ряд':        ['ряд','line','rekke','rad','række','rivi','Reihe','grille','línea','riga','linha','zakład','rij','rida','rinda','eilutė'],
  'ряда':       ['ряда','lines','rekker','rader','rækker','riviä','Reihen','grilles','líneas','righe','linhas','zakłady','rijen','rida','rindas','eilutės'],
  'ряды':       ['ряды','lines','rekker','rader','rækker','rivit','Reihen','grilles','líneas','righe','linhas','zakłady','rijen','read','rindas','eilutės'],
  'рядов':      ['рядов','lines','rekker','rader','rækker','riviä','Reihen','grilles','líneas','righe','linhas','zakładów','rijen','rida','rindas','eilučių']
};

const decodeEntities=value=>value
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");

function normalize(value){
  let token=0;
  const tokenMap=new Map();
  return decodeEntities(String(value||''))
    .replace(/__VAR_(\d+)__/g,(_,n)=>`{{${n}}}`)
    .replace(/{{\d+}}/g,m=>{
      if(!tokenMap.has(m))tokenMap.set(m,token++);
      return `{{${tokenMap.get(m)}}}`;
    })
    .replace(/[\u00a0\s]+/g,' ')
    .trim();
}

function candidateOk(value,sourceLocale='ru'){
  if(value.length<2||value.length>1400)return false;
  if(sourceLocale==='ru'&&!/[А-Яа-яЁё]/.test(value))return false;
  if(/(?:document\.|function\s*\(|=>|@media|font-family|linear-gradient|\.classList|localStorage)/.test(value))return false;
  if(/[{}]/.test(value.replace(/{{\d+}}/g,'')))return false;
  return true;
}

function fragmentCandidates(value){
  const out=[];
  const raw=String(value||'');
  if(!/[<>]/.test(raw))out.push(raw);
  const withoutTags=raw
    .replace(/<!--[^]*?-->/g,' ')
    .replace(/<(?:br|hr)\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,'\n');
  out.push(...withoutTags.split(/\n+/));
  return out.map(normalize).filter(Boolean);
}

function walk(node,visit){
  if(!node||typeof node!=='object')return;
  visit(node);
  for(const [key,value] of Object.entries(node)){
    if(key==='start'||key==='end'||key==='loc')continue;
    if(Array.isArray(value))value.forEach(item=>walk(item,visit));
    else if(value&&typeof value==='object'&&value.type)walk(value,visit);
  }
}

function extractCatalog(html){
  const entries=new Map();
  const add=(value,sourceLocale='ru')=>{
    for(const part of fragmentCandidates(value)){
      if(candidateOk(part,sourceLocale)&&!entries.has(part))entries.set(part,sourceLocale);
    }
  };

  const visibleHtml=html
    .replace(/<style\b[^>]*>[^]*?<\/style>/gi,' ')
    .replace(/<script\b[^>]*>[^]*?<\/script>/gi,' ');
  visibleHtml.replace(/>([^<>]+)</g,(_,text)=>{add(text);return _;});
  visibleHtml.replace(/\b(?:placeholder|title|aria-label|aria-description)=(['"])(.*?)\1/gi,(_,q,text)=>{add(text);return _;});

  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([^]*?)<\/script>/gi)].map(match=>match[1]);
  for(const source of scripts){
    const ast=parse(source,{ecmaVersion:'latest',sourceType:'script',allowHashBang:true});
    walk(ast,node=>{
      if(node.type==='Literal'&&typeof node.value==='string')add(node.value);
      if(node.type==='TemplateLiteral'){
        let value='';
        node.quasis.forEach((quasi,index)=>{
          value+=quasi.value.cooked??quasi.value.raw;
          if(index<node.expressions.length)value+=`{{${index}}}`;
        });
        add(value);
      }
    });
  }

  for(const [sourceLocale,values] of Object.entries(EXTRA_SOURCE)){
    for(const value of values){
      const key=normalize(value);
      if(!entries.has(key))entries.set(key,sourceLocale);
    }
  }
  return [...entries].sort(([a],[b])=>a.localeCompare(b,'ru'));
}

function translationPrompt(text,sourceLocale){
  let value=text.replace(/{{(\d+)}}/g,'__VAR_$1__');
  if(sourceLocale==='ru'){
    value=value
      .replace(/тиражей/gi,'лотерейных розыгрышей')
      .replace(/тиражах/gi,'лотерейных розыгрышах')
      .replace(/тиражам/gi,'лотерейным розыгрышам')
      .replace(/тиражи/gi,'лотерейные розыгрыши')
      .replace(/тиражом/gi,'лотерейным розыгрышем')
      .replace(/тиража/gi,'лотерейного розыгрыша')
      .replace(/тираже/gi,'лотерейном розыгрыше')
      .replace(/тиражу/gi,'лотерейному розыгрышу')
      .replace(/тираж/gi,'лотерейный розыгрыш')
      .replace(/рядов/gi,'лотерейных строк')
      .replace(/ряда/gi,'лотерейной строки')
      .replace(/ряды/gi,'лотерейные строки')
      .replace(/ряду/gi,'лотерейной строке')
      .replace(/ряд/gi,'лотерейная строка');
  }
  return value;
}

function cacheKey(sourceLocale,targetLocale,key){
  // Version lottery-draw phrases: older cached translations sometimes read
  // «тираж» as print circulation instead of a lottery draw.
  const glossaryVersion=sourceLocale==='ru'&&/тираж[\p{L}]*/iu.test(key)?':lottery-terms-v2':'';
  return `${sourceLocale}:${targetLocale}:${key}${glossaryVersion}`;
}

function cachedTranslationValid(value,sourceLocale,targetLocale,key){
  if(!value)return false;
  if(sourceLocale==='ru'&&targetLocale!=='ru'&&/[А-Яа-яЁё]/.test(value))return false;
  const expected=[...key.matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
  const actual=[...String(value).matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
  return expected===actual;
}

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function translateRequest(text,sourceLocale,targetLocale,attempt=0){
  const url=new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client','gtx');url.searchParams.set('sl',sourceLocale);
  url.searchParams.set('tl',targetLocale);url.searchParams.set('dt','t');url.searchParams.set('q',text);
  try{
    const response=await fetch(url,{headers:{'User-Agent':'LotoSimulator-i18n-builder/1.0'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const json=await response.json();
    return json[0].map(part=>part[0]).join('');
  }catch(error){
    if(attempt>=4)throw error;
    await delay(500*(2**attempt));
    return translateRequest(text,sourceLocale,targetLocale,attempt+1);
  }
}

async function translateGroup(items,sourceLocale,targetLocale,cache){
  const missing=items.filter(({key})=>!cachedTranslationValid(
    cache[cacheKey(sourceLocale,targetLocale,key)],sourceLocale,targetLocale,key
  ));
  const chunks=[];
  let chunk=[],size=0;
  for(const item of missing){
    const marked=`__MSG_${String(item.index).padStart(4,'0')}__ ${translationPrompt(item.key,sourceLocale)}\n`;
    if(chunk.length&&size+marked.length>2800){chunks.push(chunk);chunk=[];size=0;}
    chunk.push({...item,marked});size+=marked.length;
  }
  if(chunk.length)chunks.push(chunk);

  for(let chunkIndex=0;chunkIndex<chunks.length;chunkIndex++){
    const current=chunks[chunkIndex];
    const translated=await translateRequest(current.map(item=>item.marked).join(''),sourceLocale,targetLocale);
    const found=new Map();
    const marker=/__MSG_(\d{4})__\s*([^]*?)(?=__MSG_\d{4}__|$)/g;
    for(const match of translated.matchAll(marker))found.set(Number(match[1]),normalize(match[2]));
    for(const item of current){
      let value=found.get(item.index);
      if(!value){
        value=normalize(await translateRequest(translationPrompt(item.key,sourceLocale),sourceLocale,targetLocale));
      }
      const expected=[...item.key.matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
      const actual=[...value.matchAll(/{{(\d+)}}/g)].map(match=>match[1]).sort().join(',');
      if(expected!==actual)throw new Error(`Placeholder mismatch ${sourceLocale}->${targetLocale}: ${item.key} => ${value}`);
      cache[cacheKey(sourceLocale,targetLocale,item.key)]=value;
    }
    await fs.writeFile(CACHE_PATH,JSON.stringify(cache,null,2)+'\n');
    process.stdout.write(`\r${sourceLocale}->${targetLocale}: ${chunkIndex+1}/${chunks.length}`);
    await delay(120);
  }
  if(chunks.length)process.stdout.write('\n');
}

async function main(){
  const html=await fs.readFile(HTML_PATH,'utf8');
  const sourceEntries=extractCatalog(html);
  let cache={};
  try{cache=JSON.parse(await fs.readFile(CACHE_PATH,'utf8'));}catch{}
  const records=sourceEntries.map(([key,sourceLocale],index)=>({key,sourceLocale,index,translations:{}}));
  const localeCodes=Object.keys(LOCALES);

  for(const sourceLocale of new Set(records.map(record=>record.sourceLocale))){
    const items=records.filter(record=>record.sourceLocale===sourceLocale);
    for(const targetLocale of localeCodes){
      if(targetLocale===sourceLocale)continue;
      await translateGroup(items,sourceLocale,targetLocale,cache);
    }
  }

  for(const record of records){
    for(const locale of localeCodes){
      record.translations[locale]=locale===record.sourceLocale
        ? record.key
        : cache[cacheKey(record.sourceLocale,locale,record.key)];
      if(!record.translations[locale])throw new Error(`Missing ${locale}: ${record.key}`);
    }
    if(TERM_OVERRIDES[record.key])record.translations=Object.fromEntries(localeCodes.map((locale,index)=>[locale,TERM_OVERRIDES[record.key][index]]));
  }

  const payload={
    version:1,
    generatedAt:new Date().toISOString(),
    locales:LOCALES,
    entries:records.map(record=>[record.key,record.sourceLocale,localeCodes.map(locale=>record.translations[locale])])
  };
  const output=`/* Generated by scripts/build-i18n.mjs. Do not edit by hand. */\nwindow.LOTO_I18N_CATALOG=${JSON.stringify(payload)};\n`;
  await fs.writeFile(OUT_PATH,output);
  await fs.writeFile(path.join(DOWNLOADS_DIR,'i18n-catalog.js'),output);
  await fs.copyFile(path.join(ROOT,'second_version','i18n-runtime.js'),path.join(DOWNLOADS_DIR,'i18n-runtime.js'));
  console.log(`Wrote ${records.length} messages × ${localeCodes.length} locales to ${path.relative(ROOT,OUT_PATH)}`);
}

await main();
