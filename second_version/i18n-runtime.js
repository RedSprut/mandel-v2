(function(){
  'use strict';
  const catalog=window.LOTO_I18N_CATALOG;
  if(!catalog)throw new Error('LOTO_I18N_CATALOG is not loaded');
  const localeCodes=Object.keys(catalog.locales);
  const localeIndex=new Map(localeCodes.map((code,index)=>[code,index]));
  const normalize=value=>String(value??'').replace(/[\u00a0\s]+/g,' ').trim();
  const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const entries=new Map();
  const patterns=[];
  const phrases=[];

  for(const [source,sourceLocale,translations] of catalog.entries){
    const normalized=normalize(source);
    const entry={source:normalized,sourceLocale,translations};
    entries.set(normalized,entry);
    if(/{{\d+}}/.test(normalized)){
      const slots=[];
      const pieces=normalized.split(/({{\d+}})/g);
      const regex='^'+pieces.map(piece=>{
        const match=piece.match(/^{{(\d+)}}$/);
        if(match){slots.push(Number(match[1]));return '(.+?)';}
        return escapeRegExp(piece);
      }).join('')+'$';
      patterns.push({...entry,regex:new RegExp(regex,'u'),slots,weight:normalized.replace(/{{\d+}}/g,'').length});
    }else if(normalized.length>=2&&/[A-Za-zА-Яа-яЁё]/.test(normalized)){
      const beginsWithWord=/^[\p{L}\p{N}]/u.test(normalized);
      const endsWithWord=/[\p{L}\p{N}]$/u.test(normalized);
      entry.phraseRegex=new RegExp(
        (beginsWithWord?'(?<![\\p{L}\\p{N}])':'')+escapeRegExp(normalized)+(endsWithWord?'(?![\\p{L}\\p{N}])':''),
        'gu'
      );
      phrases.push(entry);
    }
  }
  patterns.sort((a,b)=>b.weight-a.weight);
  phrases.sort((a,b)=>b.source.length-a.source.length);

  let language='ru';
  const textSources=new WeakMap(),textLast=new WeakMap();
  const attributeState=new WeakMap();
  const translatedAttrs=['placeholder','title','aria-label','aria-description'];

  function valueFor(entry,code=language){
    const index=localeIndex.get(code);
    return index===undefined?entry.source:(entry.translations[index]||entry.source);
  }

  function fillTemplate(value,captures,slots){
    return value.replace(/{{(\d+)}}/g,(_,slot)=>{
      const position=slots.indexOf(Number(slot));
      return position>=0?translateCore(captures[position],language):'';
    });
  }

  function translateCore(core,code=language){
    if(!core||code==='ru'&&/[А-Яа-яЁё]/.test(core))return core;
    const exact=entries.get(core);
    if(exact)return valueFor(exact,code);
    for(const pattern of patterns){
      const match=core.match(pattern.regex);
      if(match)return fillTemplate(valueFor(pattern,code),match.slice(1),pattern.slots);
    }
    let output=core;
    for(const phrase of phrases)output=output.replace(phrase.phraseRegex,valueFor(phrase,code));
    return output;
  }

  function translate(value,code=language){
    const raw=String(value??'');
    const leading=raw.match(/^\s*/)?.[0]||'';
    const trailing=raw.match(/\s*$/)?.[0]||'';
    const core=normalize(raw);
    return leading+translateCore(core,code)+trailing;
  }

  function skipTextNode(node){
    const parent=node.parentElement;
    return !parent||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/.test(parent.tagName)||parent.closest('[data-i18n-ignore]');
  }

  function localizeTextNode(node,force=false){
    if(skipTextNode(node))return;
    const current=node.nodeValue||'';
    let source=textSources.get(node);
    const last=textLast.get(node);
    if(source===undefined||(!force&&current!==last)){
      source=current;textSources.set(node,source);
    }
    const target=translate(source);
    textLast.set(node,target);
    if(current!==target)node.nodeValue=target;
  }

  function localizeAttribute(element,name,force=false){
    if(!element.hasAttribute(name)||element.closest('[data-i18n-ignore]'))return;
    let state=attributeState.get(element);
    if(!state){state=new Map();attributeState.set(element,state);}
    const current=element.getAttribute(name)||'';
    let item=state.get(name);
    if(!item||(!force&&current!==item.last))item={source:current,last:current};
    const target=translate(item.source);
    item.last=target;state.set(name,item);
    if(current!==target)element.setAttribute(name,target);
  }

  function localizeTree(root=document,force=false){
    if(root.nodeType===Node.TEXT_NODE){localizeTextNode(root,force);return;}
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
    if(root.nodeType===Node.ELEMENT_NODE)translatedAttrs.forEach(name=>localizeAttribute(root,name,force));
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(node.nodeType===Node.TEXT_NODE)localizeTextNode(node,force);
      else translatedAttrs.forEach(name=>localizeAttribute(node,name,force));
    }
  }

  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')localizeTextNode(record.target);
      else if(record.type==='attributes')localizeAttribute(record.target,record.attributeName);
      else for(const node of record.addedNodes)localizeTree(node);
    }
  });

  function setLanguage(code){
    language=localeIndex.has(code)?code:'en';
    document.documentElement.lang=language;
    document.documentElement.dir='ltr';
    localizeTree(document,true);
    window.dispatchEvent(new CustomEvent('loto:languagechange',{detail:{language}}));
  }

  function start(){
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:translatedAttrs});
    setLanguage(language);
  }

  window.LotoI18n={
    catalog,
    get language(){return language;},
    setLanguage,
    translate,
    localizeTree,
    localeInfo:code=>catalog.locales[code],
    localeCodes:()=>[...localeCodes]
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
