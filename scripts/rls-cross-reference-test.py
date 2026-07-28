import os,requests,json,uuid
URL=os.environ["SUPABASE_URL"].rstrip("/");SRK=os.environ["SUPABASE_SERVICE_ROLE_KEY"];ANON=os.environ["SUPABASE_PUBLISHABLE_KEY"]
adm={"apikey":SRK,"Authorization":f"Bearer {SRK}","Content-Type":"application/json","Prefer":"return=representation"}
def mkuser(t):
    e=f"rls-{t}-{uuid.uuid4().hex[:8]}@example.com";p="Test!"+uuid.uuid4().hex[:12]
    uid=requests.post(f"{URL}/auth/v1/admin/users",headers=adm,json={"email":e,"password":p,"email_confirm":True}).json()["id"]
    tok=requests.post(f"{URL}/auth/v1/token?grant_type=password",headers={"apikey":ANON,"Content-Type":"application/json"},json={"email":e,"password":p}).json()["access_token"]
    return uid,tok
def rest(m,p,tok,b=None):
    r=requests.request(m,f"{URL}/rest/v1/{p}",headers={"apikey":ANON,"Authorization":f"Bearer {tok}","Content-Type":"application/json","Prefer":"return=representation"},json=b)
    try:j=r.json()
    except:j=r.text
    return r.status_code,j
sport=requests.get(f"{URL}/rest/v1/sports?select=id&limit=1",headers=adm).json()[0]["id"]
et=requests.post(f"{URL}/rest/v1/event_types",headers=adm,json={"sport_id":sport,"code":"tmp_"+uuid.uuid4().hex[:6],"name":"TMP"}).json()[0]["id"]
uidA,tokA=mkuser("a");uidB,tokB=mkuser("b")
tid=rest("POST","teams",tokA,{"owner_id":uidA,"sport_id":sport,"name":"E A"})[1][0]["id"]
pid=rest("POST","players",tokA,{"owner_id":uidA,"team_id":tid,"full_name":"J A"})[1][0]["id"]
cid=rest("POST","metric_catalogs",tokA,{"sport_id":sport,"owner_id":uidA,"code":"c"+uuid.uuid4().hex[:6],"name":"Cat"})[1][0]["id"]
vid=rest("POST","catalog_versions",tokA,{"catalog_id":cid,"version_number":1})[1][0]["id"]
mid=rest("POST","metrics",tokA,{"catalog_id":cid,"code":"goals","name":"G","nature":"primary","value_type":"counter"})[1][0]["id"]
ctx=rest("POST","observation_contexts",tokA,{"owner_id":uidA,"event_type_id":et,"team_id":tid,"catalog_version_id":vid})[1][0]["id"]
res={}
res["B_write_into_A_context_new_subject"]=rest("POST","metric_values",tokB,{"owner_id":uidB,"context_id":ctx,"metric_id":mid,"subject_type":"player","subject_id":pid,"numeric_value":99})
res["B_create_own_team_ok"]=rest("POST","teams",tokB,{"owner_id":uidB,"sport_id":sport,"name":"E B"})[0]
res["A_sees_only_own_values"]=rest("GET","metric_values?select=id,owner_id,numeric_value",tokA)
res["B_sees_only_own_values"]=rest("GET","metric_values?select=id,owner_id,numeric_value",tokB)
for u in (uidA,uidB): requests.delete(f"{URL}/auth/v1/admin/users/{u}",headers=adm)
requests.delete(f"{URL}/rest/v1/event_types?id=eq.{et}",headers=adm)
print(json.dumps(res,indent=1,ensure_ascii=False))
