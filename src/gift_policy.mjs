// Deterministic, fictional gift catalog; no inventory, shopping, AI, or PayPal API.
const catalog=Object.freeze([
 Object.freeze({id:'desk-light-a',category:'lighting',style:'PREMIUM',priceMinor:4300,source:'FICTIONAL_CATALOG'}),
 Object.freeze({id:'desk-light-b',category:'lighting',style:'PRACTICAL',priceMinor:3800,source:'FICTIONAL_CATALOG'}),
 Object.freeze({id:'gift-mug-c',category:'mug',style:'PRACTICAL',priceMinor:1700,source:'FICTIONAL_CATALOG'}),
 Object.freeze({id:'notebook-d',category:'stationery',style:'PREMIUM',priceMinor:2400,source:'FICTIONAL_CATALOG'})
]);
const deny=()=>{const e=new Error('INVALID_SYNTHETIC_GIFT_PREFERENCES');e.code='INVALID_SYNTHETIC_GIFT_PREFERENCES';throw e;};
export function selectSyntheticGift(input){
 if(!input||typeof input!=='object'||Array.isArray(input))deny();
 const {category,style,priority,maxPriceMinor}=input;
 if(Object.keys(input).sort().join(',')!==
     ['category','maxPriceMinor','priority','style'].join(',')||
    !['lighting','mug','stationery'].includes(category)||
    !['PRACTICAL','PREMIUM'].includes(style)||
    !['LOWEST_PRICE','MATCH_STYLE'].includes(priority)||
    !Number.isSafeInteger(maxPriceMinor)||maxPriceMinor<100||maxPriceMinor>1000000)
  deny();
 const listed=catalog.filter(x=>x.category===category);
 const eligible=listed.filter(x=>x.priceMinor<=maxPriceMinor)
  .map(x=>({...x,styleMatch:x.style===style,matchScore:x.style===style?100:0}));
 eligible.sort((a,b)=>priority==='MATCH_STYLE'
  ?b.matchScore-a.matchScore||a.priceMinor-b.priceMinor||a.id.localeCompare(b.id)
  :a.priceMinor-b.priceMinor||b.matchScore-a.matchScore||a.id.localeCompare(b.id));
 const selected=eligible[0]||null;
 return {
  status:selected?'SYNTHETIC_ITEM_SELECTED':'NO_ELIGIBLE_GIFT',
  accepted:!!selected,selectionOnly:true,selected,
  category,style,priority,maxPriceMinor,
  comparedCatalogItems:listed.length,eligibleItems:eligible.length,
  ranked:eligible.slice(0,3),
  catalogSource:'STATIC_FICTIONAL_ITEMS_NO_LIVE_INVENTORY',
  recommendationProof:'DETERMINISTIC_POLICY_NOT_LLM',
  checkout:'DISABLED',paymentState:'NOT_PAID',
  paypalOrderCreated:false,providerInventoryVerified:false
 };
}
