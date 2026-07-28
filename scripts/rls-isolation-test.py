import os,requests,json,uuid
URL=os.environ["SUPABASE_URL"].rstrip("/")
SRK=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANON=os.environ["SUPABASE_PUBLISHABLE_KEY"]
adm={"apikey":SRK,"Authorization":f"Bearer {SRK}","Content-Type":"application/json"}
def mkuser(tag):
    e=f"rls-{tag}-{uuid.uuid4().hex[:8]}@example.com";p="Test!"+uuid.uuid4().hex[:12]
    r=requests.post(f"{URL}/auth/v1/admin/users",headers=adm,json={"email":e,"password":p,"email_confirm":True})
    r.raise_for_status();uid=r.json()["id"]
    t=requests.post(f"{URL}/auth/v1/token?grant_type=password",headers={"apikey":ANON,"Content-Type":"application/json"},json={"email":e,"password":p})
    t.raise_for_status()
    return uid,t.json()["access_token"],e
res={}
uidA,tokA,eA=mkuser("a");uidB,tokB,eB=mkuser("b")
def h(t,extra=None):
    d={"apikey":ANON,"Authorization":f"Bearer {t}","Content-Type":"application/json"}
    if extra:d.update(extra)
    return d
def rest(m,path,tok,body=None,prefer=None):
    r=requests.request(m,f"{URL}/rest/v1/{path}",headers=h(tok,{"Prefer":prefer} if prefer else None),json=body)
    try:j=r.json()
    except:j=r.text
    return r.status_code,j
# 0 sports (shared read)
sc,sports=rest("GET","sports?select=id,code&limit=1",tokA)
sport_id=sports[0]["id"] if isinstance(sports,list) and sports else None
if not sport_id:
    sc,sp=requests.post(f"{URL}/rest/v1/sports",headers={**adm,"Prefer":"return=representation"},json={"code":"waterpolo","name":"Waterpolo"}).status_code,None
    sc,sports=rest("GET","sports?select=id,code&limit=1",tokA); sport_id=sports[0]["id"]
res["sports_read_shared"]=(sc,len(sports))
# 1 A creates team + player
sc,teamA=rest("POST","teams",tokA,{"owner_id":uidA,"sport_id":sport_id,"name":"Equipo A"},"return=representation")
res["A_insert_team"]=(sc,teamA)
tidA=teamA[0]["id"] if sc<300 else None
sc,pA=rest("POST","players",tokA,{"owner_id":uidA,"team_id":tidA,"full_name":"Jugador A"},"return=representation")
res["A_insert_player"]=(sc,pA)
# 2 B tries read A's team
res["B_read_A_team"]=rest("GET",f"teams?select=*&id=eq.{tidA}",tokB)
res["B_read_all_teams"]=rest("GET","teams?select=id,name",tokB)
res["A_read_all_teams"]=rest("GET","teams?select=id,name",tokA)
# 3 B tries update/delete A's team
res["B_update_A_team"]=rest("PATCH",f"teams?id=eq.{tidA}",tokB,{"name":"Hackeado"},"return=representation")
res["B_delete_A_team"]=rest("DELETE",f"teams?id=eq.{tidA}",tokB,None,"return=representation")
# 4 B tries insert impersonating A
res["B_insert_as_A"]=rest("POST","teams",tokB,{"owner_id":uidA,"sport_id":sport_id,"name":"Suplantado"},"return=representation")
# 5 profiles isolation
res["B_read_A_profile"]=rest("GET",f"profiles?select=id,email&id=eq.{uidA}",tokB)
res["B_read_own_profile"]=rest("GET","profiles?select=id,email",tokB)
# 6 roles
res["B_read_roles"]=rest("GET","user_roles?select=user_id,role",tokB)
res["B_selfgrant_admin"]=rest("POST","user_roles",tokB,{"user_id":uidB,"role":"admin"},"return=representation")
# 7 anon access
r=requests.get(f"{URL}/rest/v1/teams?select=id",headers={"apikey":ANON})
res["anon_read_teams"]=(r.status_code,r.text[:200])
# 8 catalogs: A creates catalog, B cannot read
sc,cat=rest("POST","metric_catalogs",tokA,{"sport_id":sport_id,"owner_id":uidA,"code":"wp-"+uuid.uuid4().hex[:6],"name":"Catálogo A"},"return=representation")
res["A_insert_catalog"]=(sc,cat)
cid=cat[0]["id"] if sc<300 else None
res["B_read_A_catalog"]=rest("GET",f"metric_catalogs?select=*&id=eq.{cid}",tokB)
sc,ver=rest("POST","catalog_versions",tokA,{"catalog_id":cid,"version_number":1},"return=representation")
res["A_insert_version"]=(sc,ver)
vid=ver[0]["id"] if sc<300 else None
res["B_insert_version_in_A_catalog"]=rest("POST","catalog_versions",tokB,{"catalog_id":cid,"version_number":2},"return=representation")
sc,m=rest("POST","metrics",tokA,{"catalog_id":cid,"code":"goals","name":"Goles","nature":"primary","value_type":"counter"},"return=representation")
res["A_insert_metric"]=(sc,m)
mid=m[0]["id"] if sc<300 else None
res["B_read_A_metric"]=rest("GET",f"metrics?select=id,code&catalog_id=eq.{cid}",tokB)
# 9 metric_values isolation
sc,ctx=rest("GET","event_types?select=id&limit=1",tokA)
et=ctx[0]["id"] if isinstance(ctx,list) and ctx else None
res["event_types_present"]=(sc,et is not None)
if et and mid and tidA:
    sc,c=rest("POST","observation_contexts",tokA,{"owner_id":uidA,"event_type_id":et,"team_id":tidA,"catalog_version_id":vid},"return=representation")
    res["A_insert_context"]=(sc,c)
    if sc<300:
        ctxid=c[0]["id"]
        pid=pA[0]["id"]
        sc,v=rest("POST","metric_values",tokA,{"owner_id":uidA,"context_id":ctxid,"metric_id":mid,"subject_type":"player","subject_id":pid,"numeric_value":3},"return=representation")
        res["A_insert_value"]=(sc,v)
        res["B_read_A_values"]=rest("GET","metric_values?select=id,numeric_value",tokB)
        res["A_read_own_values"]=rest("GET","metric_values?select=id,numeric_value",tokA)
# cleanup users
for u in (uidA,uidB):
    requests.delete(f"{URL}/auth/v1/admin/users/{u}",headers=adm)
print(json.dumps(res,indent=1,ensure_ascii=False,default=str))
