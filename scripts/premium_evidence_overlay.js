/* Premium filming lens for owner-only synthetic localhost recording.
 * Text-only DOM construction; no HTML interpolation, data fetching or provider calls.
 * Underlying real product remains visible. No full-screen PowerPoint cards. */
(() => {
  'use strict';
  if (window.ProoflineFilmLens) return;
  const STYLE_ID='proofline-film-lens-style',ROOT_ID='proofline-film-lens';
  function el(tag,cls,txt) {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(txt!==undefined)n.textContent=String(txt);
    return n;
  }
  function styleOnce(){
    if(document.getElementById(STYLE_ID))return;
    const css=document.createElement('style');css.id=STYLE_ID;
    css.textContent=`
      #proofline-film-lens{position:fixed;inset:0;z-index:15000;
        pointer-events:none;background:linear-gradient(90deg,rgba(3,10,22,.28),rgba(3,10,22,.60) 54%,rgba(3,10,22,.80));
        color:#f4f8ff;font-family:Inter,"Segoe UI",system-ui,sans-serif}
      #proofline-film-lens *{box-sizing:border-box}
      #proofline-film-lens .lens-panel{
        position:absolute;right:32px;top:43px;bottom:48px;
        width:min(712px,calc(100vw - 64px));border:1px solid #4e6e91;
        border-radius:25px;background:linear-gradient(148deg,#152940 0%,#0b1728 62%,#0e1d30 100%);
        padding:44px 45px 32px;overflow:hidden;
        box-shadow:0 22px 90px #000a,inset 0 1px #ffffff25;
        display:flex;flex-direction:column;gap:0;
        animation:lens-rise .34s ease-out both}
      #proofline-film-lens .lens-panel:before{content:'';position:absolute;right:-125px;top:-180px;
        width:380px;height:380px;border-radius:50%;background:#2677cb24;filter:blur(38px);pointer-events:none}
      #proofline-film-lens .lens-panel > *{position:relative}
      #proofline-film-lens .lens-top{display:flex;align-items:center;gap:10px;
        font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#9cc4f2}
      #proofline-film-lens .lens-dot{width:9px;height:9px;border-radius:50%;
        background:#6af0ce;box-shadow:0 0 0 5px #6af0ce1b,0 0 20px #6af0ce66}
      #proofline-film-lens .lens-index{margin-left:auto;font-size:12px;color:#718da9;font-variant-numeric:tabular-nums}
      #proofline-film-lens .lens-rule{height:1px;margin:21px 0 29px;background:linear-gradient(90deg,#5189bc66,transparent)}
      #proofline-film-lens h2{font-size:43px;line-height:1.08;letter-spacing:-.054em;font-weight:800;
        color:#f5f9ff;max-width:600px;margin:0 0 15px;text-wrap:balance}
      #proofline-film-lens .lens-sub{font-size:19px;line-height:1.48;color:#b9cbdd;
        max-width:610px;margin:0 0 25px}
      #proofline-film-lens .lens-source{padding:11px 14px;border:1px solid #426589;
        border-radius:11px;background:#10263c;color:#c5dffb;
        font-size:13px;line-height:1.35;font-weight:710;letter-spacing:.015em}
      #proofline-film-lens .lens-content{display:flex;flex-direction:column;gap:17px;
        flex:1;min-height:0;justify-content:center}
      #proofline-film-lens .lens-tag-row{display:flex;flex-wrap:wrap;gap:11px}
      #proofline-film-lens .lens-tag{padding:12px 18px;border:1px solid #457aab;
        background:#1a3a59;color:#d9efff;border-radius:12px;
        font-size:20px;line-height:1.15;font-weight:760;letter-spacing:-.02em}
      #proofline-film-lens .lens-financial{display:flex;align-items:baseline;gap:19px;
        padding:14px 0 15px;border-bottom:1px solid #35506a}
      #proofline-film-lens .lens-financial strong{font-size:45px;letter-spacing:-.06em;color:#a2e7d6}
      #proofline-film-lens .lens-financial span{font-size:15px;color:#b3c5dc}
      #proofline-film-lens .lens-step-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #proofline-film-lens .lens-step{padding:18px 13px;border:1px solid #3b5674;
        background:#142940;border-radius:13px;min-height:96px}
      #proofline-film-lens .lens-step-num{display:block;color:#7fcdfd;font-size:12px;
        letter-spacing:.12em;font-weight:800;margin-bottom:11px}
      #proofline-film-lens .lens-step-label{font-size:19px;line-height:1.2;font-weight:750;color:#f1f6ff}
      #proofline-film-lens .lens-proof{padding:18px 20px;border-radius:15px;
        background:#142a42;border:1px solid #3b5673}
      #proofline-film-lens .lens-proof-label{font-size:12px;letter-spacing:.14em;
        color:#85c7fc;font-weight:800;text-transform:uppercase;margin:0 0 10px}
      #proofline-film-lens .lens-proof-text{font-size:20px;line-height:1.35;
        color:#e1efff;font-weight:670;margin:0}
      #proofline-film-lens .lens-note{font-size:15px;line-height:1.43;color:#9eb5d0;margin:0}
      #proofline-film-lens .lens-footer{margin-top:auto;padding-top:19px;border-top:1px solid #3a536d;
        display:flex;align-items:center;justify-content:space-between;gap:12px}
      #proofline-film-lens .lens-footer-note{color:#93aecb;font-size:12px;line-height:1.4;font-weight:760;
        letter-spacing:.025em}
      #proofline-film-lens .lens-mark{color:#82d7e7;font-size:13px;font-weight:850;letter-spacing:.02em}
      @keyframes lens-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){#proofline-film-lens .lens-panel{animation:none}}
    `;
    document.head.appendChild(css);
  }
  function show(data){
    if(!data||!['gemini','paypal','provenance'].includes(data.scene))
      throw Error('INVALID_PREMIUM_EVIDENCE_SCENE');
    styleOnce();
    let root=document.getElementById(ROOT_ID);
    if(!root){root=el('div');root.id=ROOT_ID;root.setAttribute('role','region');
      root.setAttribute('aria-label','Historical evidence source explanation');
      document.body.appendChild(root);}
    root.replaceChildren();
    const panel=el('section','lens-panel');
    const header=el('div','lens-top');
    header.append(el('span','lens-dot'),el('span','', 'PROOFLINE / EVIDENCE LENS'),
      el('span','lens-index',data.indexLabel));
    panel.append(header,el('div','lens-rule'),
      el('h2','',data.title),el('p','lens-sub',data.subtitle),
      el('div','lens-source',data.sourceLabel));
    const content=el('div','lens-content');
    if(data.scene==='gemini'){
      const tagRow=el('div','lens-tag-row');
      for(const tag of data.tags)tagRow.append(el('span','lens-tag',tag));
      const proof=el('div','lens-proof');
      proof.append(el('p','lens-proof-label','HISTORICAL SIGNAL'),
        el('p','lens-proof-text','Skill categories from a previous owner-reported Gemini test'));
      content.append(tagRow,proof,el('p','lens-note',data.note));
    }else if(data.scene==='paypal'){
      const money=el('div','lens-financial');
      money.append(el('strong','','USD 1.50'),el('span','','Human-approved · Sandbox test'));
      const steps=el('div','lens-step-row');
      ['Buyer approval','Capture','Provider GET'].forEach((name,i)=>{
        const card=el('div','lens-step');
        card.append(el('span','lens-step-num','0'+(i+1)),
          el('div','lens-step-label',name));steps.append(card);
      });
      content.append(money,steps,el('p','lens-note',data.note));
    }else{
      const left=el('div','lens-proof');
      left.append(el('p','lens-proof-label','A / IN THIS VIDEO'),
        el('p','lens-proof-text','Local synthetic marketplace + injected fake provider APIs'));
      const right=el('div','lens-proof');
      right.append(el('p','lens-proof-label','B / HISTORICAL OWNER REPORT'),
        el('p','lens-proof-text','Previous Gemini and PayPal Sandbox activity · not independently replayed'));
      content.append(left,right,el('p','lens-note',data.note));
    }
    const footer=el('div','lens-footer');
    footer.append(el('span','lens-footer-note','NO NEW PROVIDER REQUESTS · NO PAYMENT POSTS'),
      el('span','lens-mark','proofline.'));
    panel.append(content,footer);root.append(panel);
  }
  function hide(){document.getElementById(ROOT_ID)?.remove();}
  window.ProoflineFilmLens=Object.freeze({show,hide});
})();