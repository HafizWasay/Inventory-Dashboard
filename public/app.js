const state={records:[],view:"overview",drawer:null,importFile:null,importPreview:null};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v??"").toLowerCase().trim();
const title=v=>String(v||"").replace(/\b\w/g,c=>c.toUpperCase());
const lowClass=s=>/malfunction|snatched|low|pending/i.test(s)?"bad":/configur|buyback/i.test(s)?"warn":/ready|done|assigned|healthy|in stock|active/i.test(s)?"good":"";
const laptop=r=>r.kind==="laptop";
const hires=()=>state.records.filter(r=>r.kind==="hire");
const stocks=()=>state.records.filter(r=>r.kind==="stock");
const canonicalMake=v=>{
  const s=norm(v);if(s==="hp")return"HP";if(s==="dell")return"Dell";if(s==="lenovo")return"Lenovo";
  if(s==="macbook")return"MacBook";if(s==="thinkpad")return"ThinkPad";return title(String(v||"").trim());
};

async function apiRequest(url,options){
  const res=await fetch(url,options);
  const contentType=res.headers.get("content-type")||"";
  let data;
  if(contentType.includes("application/json")){
    data=await res.json();
  }else{
    const text=(await res.text()).trim();
    data={error:res.status===404
      ?"The dashboard API was not found. Redeploy the latest project to Vercel."
      :(text.slice(0,180)||`Server returned ${res.status}`)};
  }
  if(!res.ok)throw Error(data.error||`Request failed (${res.status})`);
  return data;
}

async function load(){
  $("#refreshBtn").classList.add("spin");
  try{
    const data=await apiRequest("/api/data");
    state.records=data.records;
    if(data.storage?.warning){$("#storageBanner").textContent=data.storage.warning;$("#storageBanner").classList.remove("hidden")}else{$("#storageBanner").classList.add("hidden")}
    $("#lastUpdated").textContent=`Workbook refresh · ${new Date(data.updatedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
    renderAll(); toast("Workbook data refreshed");
  }catch(e){$("#storageBanner").textContent=`Data could not be loaded: ${e.message}`;$("#storageBanner").classList.remove("hidden");toast(e.message,true)}
  $("#refreshBtn").classList.remove("spin");
}

function metricData(){
  const assigned=state.records.filter(r=>laptop(r)&&r.lifecycle==="Assigned").length;
  const inStock=state.records.filter(r=>laptop(r)&&r.lifecycle==="In stock").length;
  const problem=state.records.filter(r=>laptop(r)&&["Malfunctioned","Snatched"].includes(r.lifecycle)).length;
  const pending=hires().filter(r=>!/^done$/i.test(r.status)).length;
  return[
    {label:"Assigned laptops",value:assigned,sub:"Active employee fleet",icon:"▣",tone:"#2f6fed",tint:"#e9efff",filter:"Assigned"},
    {label:"Laptops in stock",value:inStock,sub:inStock<5?"Below minimum of 5":"Available for allocation",icon:"▤",tone:inStock<5?"#d64d4d":"#20a486",tint:inStock<5?"#ffe8e8":"#e4f7f1",filter:"In stock"},
    {label:"Exception devices",value:problem,sub:"Malfunctioned or snatched",icon:"!",tone:"#e05454",tint:"#ffe9e9",filter:"exceptions"},
    {label:"Hiring actions",value:pending,sub:"Laptop setups not complete",icon:"◎",tone:"#cc8015",tint:"#fff0da",filter:"hiring"}
  ]
}

function renderAll(){
  const pending=hires().filter(r=>!/^done$/i.test(r.status)).length;
  const alertCount=stockAlerts().length;
  $("#hireBadge").textContent=pending;$("#alertBadge").textContent=alertCount;
  renderOverview();populateFilters();renderAssets();renderHiring();renderStock();renderExtensions();
}

function renderOverview(){
  $("#kpiGrid").innerHTML=metricData().map((m,i)=>`<article class="kpi" data-kpi="${esc(m.filter)}" style="--tone:${m.tone};--tint:${m.tint}" title="Click to inspect matching records"><div class="kpi-top"><span>${m.label}</span><span class="kpi-icon">${m.icon}</span></div><div class="kpi-value">${m.value.toLocaleString()}</div><small>${m.sub}</small></article>`).join("");
  const groups=["Assigned","In stock","Malfunctioned","Snatched","Buyback"].map(name=>({name,value:state.records.filter(r=>laptop(r)&&r.lifecycle===name).length}));
  const max=Math.max(...groups.map(g=>g.value),1),colors=["#2f6fed","#20b89a","#e85757","#7c5ce1","#f2a93b"];
  $("#fleetChart").innerHTML=groups.map((g,i)=>`<div class="bar-row" title="${g.value} ${g.name.toLowerCase()} laptops"><span>${g.name}</span><div class="bar-track"><div class="bar" style="width:${Math.max(2,g.value/max*100)}%;--color:${colors[i]}"></div></div><strong>${g.value}</strong></div>`).join("");
  const alerts=stockAlerts(),pending=hires().filter(r=>!/^done$/i.test(r.status)),multi=multiLaptopUsers();
  const actions=[
    ...alerts.map(r=>({title:`Reorder ${r.name}`,sub:`Only ${r.quantity} remaining`,color:"#e85757",record:r})),
    {title:`${pending.length} laptop setups pending`,sub:"Review upcoming hiring queue",color:"#f2a93b",go:"hiring"},
    {title:`${multi.length} people have multiple laptop records`,sub:"A quick assignment check may be helpful",color:"#20b89a",multi:true}
  ].filter(x=>!x.title.startsWith("0 "));
  $("#actionList").innerHTML=actions.length?actions.slice(0,5).map((a,i)=>`<div class="action-item" data-action="${i}"><span class="action-dot" style="--dot:${a.color}"></span><div><strong>${esc(a.title)}</strong><small>${esc(a.sub)}</small></div><span>›</span></div>`).join(""):`<div class="empty">Everything looks calm.</div>`;
  $("#actionList")._actions=actions;
  const watch=pending.slice(0,10);
  $("#watchTable").innerHTML=table(watch,[["Name","name"],["Type","assetType"],["Department","department"],["State","status"],["Asset tag","assetTag"]]);
}

function multiLaptopUsers(){
  const grouped=new Map();
  state.records.filter(r=>r.kind==="laptop"&&r.lifecycle==="Assigned"&&r.name&&r.name!=="Unassigned").forEach(r=>{
    const k=norm(r.name);
    if(!grouped.has(k))grouped.set(k,{name:r.name,records:[]});
    grouped.get(k).records.push(r);
  });
  return [...grouped.values()].filter(x=>x.records.length>1).sort((a,b)=>b.records.length-a.records.length||a.name.localeCompare(b.name));
}

function stockAlerts(){
  const monitored=stocks().filter(r=>Number(r.quantity)<5);
  const laptopCount=state.records.filter(r=>laptop(r)&&r.lifecycle==="In stock").length;
  if(laptopCount<5)monitored.push({id:"laptop-stock",name:"Laptops",quantity:laptopCount,status:"Low stock",kind:"summary",lifecycle:"In stock"});
  return monitored;
}

function populateFilters(){
  const states=[...new Set(state.records.filter(r=>["laptop","accessory"].includes(r.kind)).map(r=>r.lifecycle||r.status).filter(Boolean))].sort();
  const laptops=state.records.filter(laptop);
  const makes=[...new Set(laptops.map(r=>canonicalMake(r.details?.Make)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const years=[...new Set(laptops.map(r=>String(r.details?.["DOP(Year)"]||r.details?.["DOP (Year)"]||purchaseYear(r)||"")).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
  const current=$("#assetState").value,make=$("#laptopMake").value,year=$("#laptopYear").value;
  $("#assetState").innerHTML='<option value="">All states</option>'+states.map(x=>`<option>${esc(x)}</option>`).join("");
  $("#laptopMake").innerHTML='<option value="">All makes</option>'+makes.map(x=>`<option>${esc(x)}</option>`).join("");
  $("#laptopYear").innerHTML='<option value="">All purchase years</option>'+years.map(x=>`<option>${esc(x)}</option>`).join("");
  $("#assetState").value=current;$("#laptopMake").value=make;$("#laptopYear").value=year;
}

function purchaseYear(r){
  const value=r.details?.["Date Of Purchase"]||"";
  const match=String(value).match(/\b(19|20)\d{2}\b/);
  return match?match[0]:"";
}
function filteredAssets(){
  const kind=$("#assetKind").value,s=$("#assetState").value,q=norm($("#assetFilterSearch").value);
  const make=norm($("#laptopMake").value),model=norm($("#laptopModel").value),year=$("#laptopYear").value;
  return state.records.filter(r=>["laptop","accessory"].includes(r.kind)&&(!kind||r.kind===kind)&&(!s||(r.lifecycle||r.status)===s)&&(!q||norm(JSON.stringify(r)).includes(q))&&
    (r.kind!=="laptop"||!make||norm(canonicalMake(r.details?.Make))===make)&&
    (r.kind!=="laptop"||!model||norm(r.description).includes(model))&&
    (r.kind!=="laptop"||!year||String(r.details?.["DOP(Year)"]||r.details?.["DOP (Year)"]||purchaseYear(r))===year));
}
function renderAssets(){
  $("#laptopSubfilters").classList.toggle("hidden",$("#assetKind").value!=="laptop");
  const rows=filteredAssets();$("#assetCount").textContent=`${rows.length} records`;
  $("#assetTable").innerHTML=table(rows,[["User / item","name"],["Asset type","assetType"],["Lifecycle","lifecycle"],["Status","status"],["Serial number","serial"],["Asset tag","assetTag"],["Location","location"],["Department","department"]]);
}

function renderHiring(){
  const all=hires(),counts={Pending:0,Configuring:0,Ready:0,Done:0};
  all.forEach(r=>{const s=counts[r.status]!=null?r.status:/^done$/i.test(r.status)?"Done":"Pending";counts[s]++});
  $("#hiringStats").innerHTML=Object.entries(counts).map(([k,v])=>`<div class="mini-stat"><strong>${v}</strong><small>${k}</small></div>`).join("");
  const filter=$("#hireStatus").value,q=norm($("#hireSearch").value);
  const rows=all.filter(r=>{const status=counts[r.status]!=null?r.status:/^done$/i.test(r.status)?"Done":"Pending";return(!filter||status===filter)&&(!q||norm(JSON.stringify(r)).includes(q))});
  const order=["Pending","Configuring","Ready","Done"];
  $("#hiringBoard").innerHTML=rows.length?rows.map(r=>{const s=order.includes(r.status)?r.status:/^done$/i.test(r.status)?"Done":"Pending",idx=order.indexOf(s);return`<div class="hire-card" data-id="${r.id}"><div class="hire-top"><div><h3>${esc(r.name)}</h3><p>${esc(r.department||"Department not listed")} · ${esc(r.details.Designation||"Role not listed")}</p></div><span class="status ${lowClass(s)}">${s}</span></div><p>Start: ${esc(r.details.Date||"Not set")} · Laptop: ${esc(r.details["Laptop Asset Tag"]||"Not assigned")}</p><div class="workflow">${order.map((_,i)=>`<i class="stage ${i<=idx?"on":""}"></i>`).join("")}</div></div>`}).join(""):`<div class="empty">No hires match these filters.</div>`;
}

function renderStock(){
  const laptopCount=state.records.filter(r=>laptop(r)&&r.lifecycle==="In stock").length;
  const cards=[...stocks(),{id:"laptop-stock",name:"Laptops",quantity:laptopCount,status:laptopCount<5?"Low stock":"Healthy",kind:"summary"}];
  $("#stockCards").innerHTML=cards.map(r=>`<article class="stock-card ${Number(r.quantity)<5?"low":""}" data-id="${r.id}"><span class="flag status ${Number(r.quantity)<5?"bad":"good"}">${Number(r.quantity)<5?"Reorder":"Healthy"}</span><p class="eyebrow">CURRENT STOCK</p><h3>${esc(r.name)}</h3><div class="stock-number">${r.quantity}</div><small class="muted">Alert threshold: fewer than 5</small></article>`).join("");
  const rows=state.records.filter(r=>laptop(r)&&r.lifecycle==="In stock");
  $("#stockLaptopTable").innerHTML=table(rows,[["Make","name"],["Description","description"],["Serial","serial"],["Asset tag","assetTag"],["Purchase date","Date Of Purchase"],["Vendor","Vendor"]]);
}
function renderExtensions(){
  const q=norm($("#extensionSearch")?.value||"");
  const rows=state.records.filter(r=>r.kind==="extension"&&(!q||norm(JSON.stringify(r)).includes(q)));
  $("#extensionCount").textContent=`${rows.length} extensions`;
  $("#extensionTable").innerHTML=table(rows,[["Extension","serial"],["Name / location","name"]]);
}

function table(rows,cols){
  if(!rows.length)return'<div class="empty">No matching records.</div>';
  return`<table class="data-table"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r=>`<tr data-id="${r.id}">${cols.map(([label,f])=>{const v=r[f]??r.details?.[f]??"";return`<td title="${esc(v)}">${/status|lifecycle/i.test(f)?`<span class="status ${lowClass(v)}">${esc(v||"—")}</span>`:esc(v||"—")}</td>`}).join("")}<td>›</td></tr>`).join("")}</tbody></table>`;
}

function showView(view){
  state.view=view;$$(".view").forEach(v=>v.classList.toggle("active",v.id===`${view}View`));$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.view===view));
  const titles={overview:"Good morning, IT team",assets:"Asset register",hiring:"Hiring readiness",stock:"Stock control",extensions:"Extension finder"};$("#pageTitle").textContent=titles[view];
  $(".sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
}

function openRecord(r){
  if(!r)return;state.drawer=r;$("#drawerTitle").textContent=r.name||r.assetType;$("#drawerEyebrow").textContent=r.kind==="hire"?"HIRING & LAPTOP SETUP":"RECORD DETAILS";
  const details=Object.entries(r.details||{}).filter(([k,v])=>v!==""&&!/^Unnamed/.test(k));
  $("#drawerBody").innerHTML=`<div class="detail-grid">${details.map(([k,v])=>`<div class="detail"><label>${esc(k)}</label><p>${esc(v)}</p></div>`).join("")}</div>${recordActions(r)}${editForm(r)}`;
  $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#scrim").classList.remove("hidden");
}
function recordActions(r){
  if(r.kind==="summary")return"";
  return`<div class="record-actions">${r.kind==="laptop"?'<button class="secondary-btn" data-record-action="move">⇄ Move lifecycle</button>':""}<button class="danger-btn" data-record-action="delete">Delete record</button></div>`;
}
const lifecycleLabels={assigned:"Assigned",instock:"In stock",malfunctioned:"Malfunctioned",buyback:"Buyback"};
function openMoveForm(){
  const r=state.drawer,current=r.source;
  $("#drawerTitle").textContent=`Move ${r.assetTag||r.serial||"laptop"}`;$("#drawerEyebrow").textContent="LIFECYCLE TRANSFER";
  $("#drawerBody").innerHTML=`<p class="muted">The laptop will be added to the destination workbook and removed from ${lifecycleLabels[current]}. Both workbooks are backed up first.</p>
  <form class="edit-form" id="moveForm"><div class="form-field full"><label>Move to</label><select id="moveDestination">${Object.entries(lifecycleLabels).filter(([k])=>k!==current).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div><div id="moveFields" class="form-grid"></div><div class="form-actions"><button type="button" class="secondary-btn" data-reopen>Back</button><button class="primary-btn">Move laptop</button></div></form>`;
  renderMoveFields();
}
function renderMoveFields(){
  const destination=$("#moveDestination").value;
  const fields=destination==="assigned"?[["Employee ID","Employee ID"],["Employee name","Employee Name",true],["Department","Department"],["Designation","Designation"]]:
    destination==="malfunctioned"?[["Employee name","Employee Name"],["Issue / fault","Issue"]]:
    destination==="buyback"?[["Employee ID","Employee ID"],["Employee name","Employee Name"],["Department","Department"],["Position","Designation"],["Buyback date","BuyBack Date","date"]]:[];
  $("#moveFields").innerHTML=fields.length?fields.map(([label,name,type])=>`<div class="form-field"><label>${label}</label><input name="${name}" type="${type==="date"?"date":"text"}" ${type===true?"required":""}></div>`).join(""):`<div class="move-note">No additional details are required to return this laptop to stock.</div>`;
}
async function submitMove(form){
  const values=Object.fromEntries(new FormData(form).entries()),destination=$("#moveDestination").value,btn=form.querySelector(".primary-btn");
  btn.disabled=true;btn.textContent="Moving…";
  try{await apiRequest("/api/move",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:state.drawer.source,row:state.drawer.row,destination,values})});closeDrawer();await load();toast(`Laptop moved to ${lifecycleLabels[destination]}`)}
  catch(e){toast(e.message,true);btn.disabled=false;btn.textContent="Try again"}
}
async function deleteCurrentRecord(){
  const r=state.drawer;if(!confirm(`Delete ${r.name||r.assetTag||"this record"}? A workbook backup will be created first.`))return;
  try{await apiRequest("/api/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:r.source,row:r.row})});closeDrawer();await load();toast("Record deleted")}
  catch(e){toast(e.message,true)}
}
function openMultiReview(){
  const users=multiLaptopUsers();state.drawer={kind:"multi-review"};
  $("#drawerTitle").textContent="Multiple laptop assignments";$("#drawerEyebrow").textContent="FRIENDLY REVIEW";
  $("#drawerBody").innerHTML=`<p class="muted">These records may be completely valid. This is simply a gentle prompt to confirm that each assignment is still current.</p><div class="multi-list">${users.map(u=>`<div class="multi-user"><div><strong>${esc(u.name)}</strong><small>${u.records.length} laptop records</small></div><div>${u.records.map(r=>`<button class="asset-chip" data-id="${r.id}">${esc(r.assetTag||r.serial||"View laptop")}</button>`).join("")}</div></div>`).join("")}</div>`;
  $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#scrim").classList.remove("hidden");
}
const addSchemas={
  assigned:{label:"Assigned laptop",source:"assigned",fields:[["Employee ID","Employee ID"],["Employee Name","Employee Name"],["Department","Department "],["Designation","Designation"],["Make","Make","make"],["Model / specifications","Eqipment Description"],["Serial number","Serial #"],["Asset tag","ASSETS TAG"],["Purchase date","Date Of Purchase","date"],["Purchase value","Purchase Value","number"],["Vendor","Vendor Name"]]},
  instock:{label:"In-stock laptop",source:"instock",fields:[["Make","Make","make"],["Model / specifications","Equipment Description"],["Serial number","Serial #"],["Asset tag","ASSETS TAG"],["Purchase date","Date Of Purchase","date"],["Purchase value","Purchase Value","number"],["Vendor","Vendor"]]},
  accessories:{label:"Headphone / mouse assignment",source:"accessories",fields:[["Date","Date","date"],["Asset type","Asset Type","asset"],["Brand / model","Brand/Model"],["User / department","User/Department"],["Location","Location"],["Status","Status","status"]]},
  hiring:{label:"Upcoming hire",source:"hiring",fields:[["Start date","Date","date"],["Name","Name"],["Contact","Contact"],["Department","Department"],["Designation","Designation"],["Laptop status","Status","hirestatus"]]}
  ,stock:{label:"Stock item",source:"stock",fields:[["Item name","Item"],["Available units","Units","number"]]}
  ,extensions:{label:"Extension entry",source:"extensions",fields:[["Extension number","extension"],["Name / location","name"]]}
};
function fieldControl([label,name,type]){
  const options={make:["HP","Dell","Lenovo","MacBook","ThinkPad","Other"],asset:["Headphones","Mouse"],status:["Active","Returned","Inactive"],hirestatus:["Pending","Done"]};
  if(options[type])return`<div class="form-field"><label>${label}</label><select name="${name}" required><option value="">Select…</option>${options[type].map(v=>`<option>${v}</option>`).join("")}</select></div>`;
  return`<div class="form-field"><label>${label}</label><input name="${name}" type="${type||"text"}" ${["Employee Name","Name","Make","Asset Type"].includes(name)?"required":""}></div>`;
}
function renderAddFields(){
  const schema=addSchemas[$("#addRecordType").value];
  $("#addFields").innerHTML=schema.fields.map(fieldControl).join("");
}
function openAddData(){
  state.drawer={kind:"add"};$("#drawerTitle").textContent="Add daily data";$("#drawerEyebrow").textContent="UPDATE EXCEL FROM DASHBOARD";
  $("#drawerBody").innerHTML=`<p class="muted">Choose what happened today. Saving appends a new row to the correct Excel workbook and makes a backup automatically.</p><form class="edit-form" id="addForm"><div class="form-field full"><label>Record type</label><select id="addRecordType">${Object.entries(addSchemas).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("")}</select></div><div id="addFields" class="form-grid"></div><div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button><button class="primary-btn">Add to workbook</button></div></form>`;
  renderAddFields();$("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#scrim").classList.remove("hidden");
}
async function submitAddForm(form){
  const schema=addSchemas[$("#addRecordType").value],values=Object.fromEntries(new FormData(form).entries());
  const btn=form.querySelector(".primary-btn");btn.disabled=true;btn.textContent="Adding…";
  try{await apiRequest("/api/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:schema.source,values})});closeDrawer();await load();toast(`Added to ${schema.label.toLowerCase()} workbook`)}
  catch(e){toast(e.message,true);btn.disabled=false;btn.textContent="Try again"}
}
const importDatasets={
  assigned:"Assigned laptops",instock:"In-stock laptops",accessories:"Headphone & mouse assignments",hiring:"Upcoming hires",extensions:"Extension directory"
};
function openImport(){
  state.drawer={kind:"import"};state.importFile=null;state.importPreview=null;
  $("#drawerTitle").textContent="Import data file";$("#drawerEyebrow").textContent="CSV / XLSX COLUMN MAPPING";
  $("#drawerBody").innerHTML=`<p class="muted">Your file does not need identical column names. Choose the destination, upload it, then review the suggested mappings before anything is changed.</p>
  <form class="edit-form" id="importPreviewForm"><div class="form-grid">
    <div class="form-field full"><label>Destination dataset</label><select id="importSource">${Object.entries(importDatasets).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="form-field full"><label>CSV or XLSX file</label><input id="importFile" type="file" accept=".csv,.xlsx" required></div>
  </div><div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button><button class="primary-btn">Preview columns</button></div></form><div id="importMapping"></div>`;
  $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#scrim").classList.remove("hidden");
}
function fileAsBase64(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error("Could not read file"));reader.readAsDataURL(file)});
}
async function previewImport(form){
  const file=$("#importFile").files[0];if(!file)return;
  if(location.hostname.endsWith("vercel.app")&&file.size>3*1024*1024){toast("Use an Excel or CSV file smaller than 3 MB on Vercel",true);return}
  const btn=form.querySelector(".primary-btn");btn.disabled=true;btn.textContent="Reading…";
  try{
    const content=await fileAsBase64(file),source=$("#importSource").value;
    const data=await apiRequest("/api/import/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,filename:file.name,content})});
    state.importFile={filename:file.name,content,source};state.importPreview=data;renderImportMapping();
  }catch(e){toast(e.message,true);btn.disabled=false;btn.textContent="Preview columns"}
}
function renderImportMapping(){
  const p=state.importPreview,options=target=>`<option value="">Do not import</option>${p.headers.map(h=>`<option ${p.suggestions[target]===h?"selected":""}>${esc(h)}</option>`).join("")}`;
  const sampleCols=p.headers.slice(0,5);
  $("#importMapping").innerHTML=`<div class="import-summary"><strong>${p.rowCount.toLocaleString()} rows found</strong><small>Review each destination field and its source column.</small></div>
  <form id="importCommitForm"><div class="mapping-grid">${p.fields.map(target=>`<label><span>${esc(target)}</span><select class="map-select" data-target="${esc(target)}">${options(target)}</select></label>`).join("")}</div>
  <div class="sample-wrap"><p class="eyebrow">FILE PREVIEW</p>${tablePreview(p.sample,sampleCols)}</div>
  <div class="import-mode"><label><input type="radio" name="mode" value="append" checked> Append rows</label><label><input type="radio" name="mode" value="replace"> Replace this dataset</label></div>
  <p class="replace-note">Replace removes current rows from this dataset after creating a backup. Other datasets are untouched.</p>
  <div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button><button class="primary-btn">Import ${p.rowCount.toLocaleString()} rows</button></div></form>`;
}
function tablePreview(rows,cols){
  return`<div class="table-wrap"><table class="data-table compact"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
async function commitImport(form){
  const mode=form.querySelector('input[name="mode"]:checked').value;
  if(mode==="replace"&&!confirm(`Replace all current ${importDatasets[state.importFile.source]} rows? A backup will be created first.`))return;
  const mapping={};form.querySelectorAll(".map-select").forEach(s=>{if(s.value)mapping[s.dataset.target]=s.value});
  const btn=form.querySelector(".primary-btn");btn.disabled=true;btn.textContent="Importing…";
  try{
    const data=await apiRequest("/api/import/commit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...state.importFile,mapping,mode})});
    closeDrawer();await load();toast(`${data.imported} rows imported successfully`);
  }catch(e){toast(e.message,true);btn.disabled=false;btn.textContent="Try import again"}
}
function openExport(){
  state.drawer={kind:"export"};$("#drawerTitle").textContent="Export CSV";$("#drawerEyebrow").textContent="DOWNLOAD DASHBOARD DATA";
  const choices={all:"Complete dashboard",assigned:"Assigned laptops",instock:"In-stock laptops",malfunctioned:"Malfunctioned laptop records",snatched:"Snatched laptop records",buyback:"Buyback laptop records",accessories:"Headphone & mouse assignments",stock:"Available stock",hiring:"Upcoming hires",extensions:"Extension directory"};
  $("#drawerBody").innerHTML=`<p class="muted">Choose a dataset. Your browser will download a CSV that opens in Excel and other spreadsheet tools.</p><div class="export-list">${Object.entries(choices).map(([k,v])=>`<a class="export-choice" href="/api/export?source=${k}" download><span><strong>${v}</strong><small>${k==="all"?"One normalized file for reporting":"Original workbook columns"}</small></span><b>CSV ↓</b></a>`).join("")}</div>`;
  $("#drawer").classList.add("open");$("#drawer").setAttribute("aria-hidden","false");$("#scrim").classList.remove("hidden");
}
function editForm(r){
  if(r.kind==="summary")return"";
  if(r.kind==="hire")return`<form class="edit-form" id="editForm"><h3>Manage laptop readiness</h3><div class="form-grid">
    <div class="form-field"><label>Workflow status</label><select name="Laptop Status">${["Pending","Configuring","Ready","Done"].map(x=>`<option ${r.status===x||(!r.details["Laptop Status"]&&x===(/^done$/i.test(r.status)?"Done":"Pending"))?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="form-field"><label>Laptop asset tag</label><input name="Laptop Asset Tag" value="${esc(r.details["Laptop Asset Tag"]||"")}"></div>
    <div class="form-field"><label>Laptop serial</label><input name="Laptop Serial" value="${esc(r.details["Laptop Serial"]||"")}"></div>
    <div class="form-field"><label>Configuration owner</label><input name="Configuration Owner" value="${esc(r.details["Configuration Owner"]||"")}"></div>
    <div class="form-field full"><label>Setup notes</label><textarea name="Setup Notes" rows="3">${esc(r.details["Setup Notes"]||"")}</textarea></div>
  </div><div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button><button class="primary-btn">Save to hiring workbook</button></div></form>`;
  const fields=r.kind==="stock"?[["Units","quantity","Units"]]:r.kind==="extension"?[["Extension","serial","extension"],["Name / location","name","name"]]:r.kind==="accessory"?[["Status","status"],["Location","location"],["User/Department","name"]]:[["Employee Name","name"],["Serial #","serial"],["ASSETS TAG","assetTag"],["Issue","Issue"]];
  return`<form class="edit-form" id="editForm"><h3>Update workbook record</h3><div class="form-grid">${fields.map(([label,f,sheetField])=>`<div class="form-field ${label==="Issue"?"full":""}"><label>${label}</label><input name="${sheetField||label}" value="${esc(r[f]??r.details?.[f]??"")}"></div>`).join("")}</div><div class="form-actions"><button type="button" class="secondary-btn" data-close>Cancel</button><button class="primary-btn">Save changes</button></div></form>`;
}
function closeDrawer(){$("#drawer").classList.remove("open");$("#drawer").setAttribute("aria-hidden","true");$("#scrim").classList.add("hidden");state.drawer=null}
async function saveForm(form){
  const updates=Object.fromEntries(new FormData(form).entries());const btn=form.querySelector(".primary-btn");btn.disabled=true;btn.textContent="Saving…";
  try{await apiRequest("/api/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:state.drawer.source,row:state.drawer.row,updates})});closeDrawer();await load();toast("Saved to workbook");}
  catch(e){toast(e.message,true);btn.disabled=false;btn.textContent="Try again"}
}
function globalSearch(){
  const q=norm($("#globalSearch").value),box=$("#searchResults");if(q.length<2){box.classList.add("hidden");return}
  const rows=state.records.filter(r=>norm(JSON.stringify(r)).includes(q)).slice(0,12);
  box.innerHTML=rows.length?rows.map(r=>`<div class="search-result" data-id="${r.id}"><span class="result-icon">${r.kind==="hire"?"◎":r.kind==="accessory"?"◇":r.kind==="extension"?"☎":"▣"}</span><div><strong>${esc(r.name)}</strong><small>${esc([r.assetType,r.serial,r.assetTag,r.department].filter(Boolean).join(" · "))}</small></div><span class="status ${lowClass(r.status||r.lifecycle)}">${esc(r.status||r.lifecycle)}</span></div>`).join(""):`<div class="empty">No matching people, assets, or extensions.</div>`;box.classList.remove("hidden");
}
function toast(msg,error=false){const t=$("#toast");t.textContent=msg;t.style.background=error?"#b83f45":"#15233b";t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2600)}

document.addEventListener("click",e=>{
  const recordAction=e.target.closest("[data-record-action]");if(recordAction){if(recordAction.dataset.recordAction==="move")openMoveForm();else deleteCurrentRecord();return}
  if(e.target.closest("[data-reopen]")){openRecord(state.drawer);return}
  const nav=e.target.closest("[data-view]");if(nav)showView(nav.dataset.view);
  const go=e.target.closest("[data-go]");if(go)showView(go.dataset.go);
  const row=e.target.closest("[data-id]");if(row&&row.dataset.id!=="laptop-stock")openRecord(state.records.find(r=>r.id===row.dataset.id));
  const result=e.target.closest(".search-result");if(result){openRecord(state.records.find(r=>r.id===result.dataset.id));$("#searchResults").classList.add("hidden")}
  const kpi=e.target.closest("[data-kpi]");if(kpi){const f=kpi.dataset.kpi;if(f==="hiring")showView("hiring");else{showView("assets");$("#assetState").value=f==="exceptions"?"Malfunctioned":f;renderAssets()}}
  const action=e.target.closest("[data-action]");if(action){const a=$("#actionList")._actions[Number(action.dataset.action)];if(a.record)openRecord(a.record);else if(a.go)showView(a.go);else if(a.multi)openMultiReview()}
  if(e.target.closest("[data-close]")||e.target===$("#scrim")||e.target===$("#closeDrawer"))closeDrawer();
});
document.addEventListener("submit",e=>{if(e.target.id==="editForm"){e.preventDefault();saveForm(e.target)}if(e.target.id==="moveForm"){e.preventDefault();submitMove(e.target)}if(e.target.id==="addForm"){e.preventDefault();submitAddForm(e.target)}if(e.target.id==="importPreviewForm"){e.preventDefault();previewImport(e.target)}if(e.target.id==="importCommitForm"){e.preventDefault();commitImport(e.target)}});
document.addEventListener("change",e=>{if(e.target.id==="addRecordType")renderAddFields();if(e.target.id==="moveDestination")renderMoveFields()});
$("#nav").addEventListener("click",e=>{const b=e.target.closest(".nav-item");if(b)showView(b.dataset.view)});
$("#refreshBtn").addEventListener("click",load);$("#menuBtn").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
$("#addDataBtn").addEventListener("click",openAddData);
$("#importBtn").addEventListener("click",openImport);$("#exportBtn").addEventListener("click",openExport);
$("#globalSearch").addEventListener("input",globalSearch);
["assetKind","assetState","assetFilterSearch","laptopMake","laptopModel","laptopYear"].forEach(id=>$("#"+id).addEventListener("input",renderAssets));
$("#clearFilters").addEventListener("click",()=>{$("#assetKind").value="";$("#assetState").value="";$("#assetFilterSearch").value="";$("#laptopMake").value="";$("#laptopModel").value="";$("#laptopYear").value="";renderAssets()});
["hireStatus","hireSearch"].forEach(id=>$("#"+id).addEventListener("input",renderHiring));
$("#extensionSearch").addEventListener("input",renderExtensions);$("#clearExtensionSearch").addEventListener("click",()=>{$("#extensionSearch").value="";renderExtensions()});
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#globalSearch").focus()}if(e.key==="Escape"){closeDrawer();$("#searchResults").classList.add("hidden")}});
load();
