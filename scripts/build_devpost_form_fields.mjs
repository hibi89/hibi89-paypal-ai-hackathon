// Owner-only local Devpost form fields from a checked-in, unpublished English draft.
// Never reads credentials, private SQLite, or remote provider data; never uploads.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const DRAFT=new URL('../docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md',import.meta.url);
const FIELDS=['Inspiration','What it does','What uses PayPal and AI',
 'How we built it','Challenges','Accomplishments','What we learned',"What's next"];
const fail=code=>{throw Error(code)};
export function buildDevpostFormFields(source){
 if(typeof source!=='string'||source.length<4500||source.length>20000||
    !source.includes('DRAFT — NOT PUBLISHED')||!source.includes('NOT SUBMITTED')||
    !source.includes('RELEASE HOLD')||!source.includes('OFFLINE_MOCK')||
    !source.includes('not independently reproduced in CI')||
    !source.includes('OWNER TO ADD AFTER APPROVED PUBLIC YOUTUBE UPLOAD'))
  fail('UNPUBLISHED_SOURCE_EVIDENCE_REQUIRED');
 const heading=/^## ([^\r\n]+)\r?$/gm;
 const matches=[...source.matchAll(heading)];
 const blocks=new Map();
 for(let i=0;i<matches.length;i++){
  const name=matches[i][1],start=matches[i].index+matches[i][0].length;
  if(blocks.has(name))fail('DUPLICATE_FORM_SECTION');
  const end=i+1<matches.length?matches[i+1].index:source.length;
  const body=source.slice(start,end).trim();
  if(body.length<2)fail('EMPTY_FORM_SECTION');
  blocks.set(name,body);
 }
 const title=blocks.get('Project title'),tagline=blocks.get('Tagline');
 if(!title||!tagline||title.includes('\n')||tagline.includes('\n')||
    title.length>120||tagline.length>160||title.length<10||tagline.length<20)
  fail('TITLE_AND_TAGLINE_REQUIRED');
 const sections=[];
 for(const name of FIELDS){
  const body=blocks.get(name);
  if(typeof body!=='string'||body.length<50)
   fail('REQUIRED_FORM_SECTION_MISSING');
  sections.push('### '+name+'\n\n'+body);
 }
 const builtWith=blocks.get('Built with');
 const demo=blocks.get('Reviewer quickstart — synthetic demonstration only');
 if(!builtWith||builtWith.length<70||!demo||
    !demo.includes('git switch lead/paypal')||!demo.includes('npm run demo'))
  fail('REPRODUCIBLE_LOCAL_REVIEWER_ROUTE_REQUIRED');
 const sourceAndDemo=blocks.get('Source and demo');
 if(!sourceAndDemo?.includes('https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal')||
    !sourceAndDemo.includes('draft PR #28')||
    !sourceAndDemo.includes('NOT SUBMITTED'))
  fail('RELEASE_PREVIEW_PROVENANCE_REQUIRED');
 const descriptionMarkdown=sections.join('\n\n')+'\n\n### Built with\n\n'+builtWith;
 if(descriptionMarkdown.length>15000||descriptionMarkdown.length<2800)
  fail('FORM_DESCRIPTION_LENGTH_INVALID');
 return Object.freeze({
  schemaVersion:1,
  state:'OWNER_REVIEW_REQUIRED_NOT_SUBMITTED',
  projectTitle:title,tagline,
  descriptionMarkdown,
  sourceRepositoryUrl:'https://github.com/hibi89/hibi89-paypal-ai-hackathon/tree/lead/paypal',
  hostedDemoUrl:null,publicYouTubeUrl:null,devpostReceiptUrl:null,
  reviewerInstructions:demo,
  defaultMainSourceReleased:false,
  historicalProviderEvidence:'OWNER_REPORTED_NOT_INDEPENDENTLY_REPRODUCED',
  offlineBrowserProviderCalls:0,actualPaymentAuthorized:false,
  ownerAuthorizedPublication:false,devpostSubmitted:false,
  reviewNotice:'Editable LOCAL DRAFT. Must obtain explicit owner approval for main release, video publication and Devpost submission.'
 });
}
export function generateLocalDevpostDraft({root=ROOT,write=true}={}){
 const raw=readFileSync(join(root,'docs','DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md'),'utf8');
 const fields=buildDevpostFormFields(raw);
 if(write){
  const dir=join(root,'output','submission');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'devpost_form_draft.json'),
    JSON.stringify(fields,null,2)+'\n',{encoding:'utf8',flag:'w'});
 }
 return fields;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length>1||(args.length===1&&args[0]!=='--check'))
    fail('LOCAL_DEVPOST_FLAGS_REJECTED');
  const fields=generateLocalDevpostDraft({write:!args.includes('--check')});
  console.log(JSON.stringify({status:fields.state,projectTitle:fields.projectTitle,
    sourceRepositoryUrl:fields.sourceRepositoryUrl,
    publicYouTubeUrl:fields.publicYouTubeUrl,devpostReceiptUrl:fields.devpostReceiptUrl,
    ownerAuthorizedPublication:false,devpostSubmitted:false,
    output:args.includes('--check')?'VALIDATED_NO_WRITE':'output/submission/devpost_form_draft.json'}));
 }catch(error){
  console.error('LOCAL_DEVPOST_DRAFT_FAILED '+error.message);
  process.exitCode=1;
 }
}
