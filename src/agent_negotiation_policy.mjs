// Pure, offline-only bargaining policy. No payment or provider authority.
export function negotiateBoundedPrice({buyerMaxMinor,sellerMinMinor,openingMinor,currency='USD',maxRounds=5}={}) {
  const valid=n=>Number.isSafeInteger(n)&&n>0&&n<=100_000_000;
  if(!valid(buyerMaxMinor)||!valid(sellerMinMinor)||!valid(openingMinor))
    throw new TypeError('INVALID_PRICE_MINOR');
  if(currency!=='USD')throw new TypeError('UNSUPPORTED_CURRENCY');
  if(!Number.isSafeInteger(maxRounds)||maxRounds<1||maxRounds>10)
    throw new TypeError('INVALID_ROUND_LIMIT');
  if(sellerMinMinor>buyerMaxMinor)
    return Object.freeze({status:'NO_AGREEMENT',reason:'NO_OVERLAPPING_BUDGET',currency,rounds:[]});
  // Integer cents; bounded, deterministic, and never creates an authorization.
  let buyer=buyerMaxMinor,seller=Math.max(sellerMinMinor,openingMinor);
  const rounds=[];
  for(let i=0;i<maxRounds;i++){
    const offer=Math.max(sellerMinMinor,Math.min(buyerMaxMinor,Math.floor((buyer+seller)/2)));
    rounds.push(Object.freeze({round:i+1,buyerLimitMinor:buyerMaxMinor,sellerFloorMinor:sellerMinMinor,offerMinor:offer}));
    if(offer>=sellerMinMinor&&offer<=buyerMaxMinor)
      return Object.freeze({status:'PROPOSED',currency,agreedMinor:offer,rounds:Object.freeze(rounds),requiresHumanApproval:true,paymentAuthorized:false});
  }
  return Object.freeze({status:'NO_AGREEMENT',reason:'ROUND_LIMIT',currency,rounds:Object.freeze(rounds)});
}
