// Owner-provided catalog is local data, NOT authenticated merchant stock.
// No vendor requests, AI transport, authorization to buy, or real inventory proof.
const KEYS='category,id,priceMinor,style';
const ID=/^[A-Za-z0-9_-]{1,32}$/;
const reject=()=>{const e=new Error('INVALID_OWNER_LOCAL_GIFT_CATALOG');e.code=e.message;throw e;};
export function validateOwnerGiftCatalog(items){
 if(!Array.isArray(items)||items.length<2||items.length>8)reject();
 const found=new Set();
 for(const i of items){
  if(!i||typeof i!=='object'||Array.isArray(i)||
   Object.keys(i).sort().join(',')!==KEYS||
   !ID.test(i.id)||found.has(i.id)||
   !['lighting','mug','stationery'].includes(i.category)||
   !['PRACTICAL','PREMIUM'].includes(i.style)||
   !Number.isSafeInteger(i.priceMinor)||i.priceMinor<100||i.priceMinor>1_000_000)
    reject();
  found.add(i.id);
 }
 return items.map(i=>({id:i.id,category:i.category,style:i.style,
  priceMinor:i.priceMinor,source:'OWNER_SUPPLIED_LOCAL_NOT_VENDOR_VERIFIED'}));
}
export function selectOwnerLocalGift(input,items,revision){
 if(!Number.isSafeInteger(revision)||revision<1||revision>1000)reject();
 const catalog=validateOwnerGiftCatalog(items);
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).sort().join(',')!=='category,maxPriceMinor,priority,style'||
   !['lighting','mug','stationery'].includes(input.category)||
   !['PRACTICAL','PREMIUM'].includes(input.style)||
   !['LOWEST_PRICE','MATCH_STYLE'].includes(input.priority)||
   !Number.isSafeInteger(input.maxPriceMinor)||
   input.maxPriceMinor<100||input.maxPriceMinor>1_000_000)reject();
 const matches=catalog.filter(i=>i.category===input.category);
 const eligible=matches.filter(i=>i.priceMinor<=input.maxPriceMinor)
  .map(i=>({...i,styleMatch:i.style===input.style,
   matchScore:i.style===input.style?100:0}));
 eligible.sort((a,b)=>input.priority==='MATCH_STYLE'
  ?b.matchScore-a.matchScore||a.priceMinor-b.priceMinor||a.id.localeCompare(b.id)
  :a.priceMinor-b.priceMinor||b.matchScore-a.matchScore||a.id.localeCompare(b.id));
 const selected=eligible[0]??null;
 return {status:selected?'OWNER_LOCAL_ITEM_SELECTED':'NO_ELIGIBLE_GIFT',
  accepted:!!selected,selectionOnly:true,selected,category:input.category,
  style:input.style,priority:input.priority,maxPriceMinor:input.maxPriceMinor,
  comparedCatalogItems:matches.length,eligibleItems:eligible.length,
  ranked:eligible.slice(0,3),catalogRevision:revision,
  catalogSource:'OWNER_SUPPLIED_LOCAL_NOT_VENDOR_VERIFIED',
  providerInventoryVerified:false,recommendationProof:'DETERMINISTIC_POLICY_NOT_LLM',
  checkout:'DISABLED',paymentState:'NOT_PAID',paypalOrderCreated:false};
}
