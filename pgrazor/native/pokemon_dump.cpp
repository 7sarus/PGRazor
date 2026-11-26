#include "pokemon_dump.h"
#include "runtime_bootstrap.h"
#include "runtime_transport.h"
#include "shared_metadata.h"
#include <cmath>
#include <cstring>
#include <dlfcn.h>
#include <map>
#include <string>
#include <time.h>
#include <unistd.h>
#include <vector>
// One-shot export of every owned Pokemon. Java arms a token in transport string slot 28 ("D|<token>");
// the next game tick reads the live bag once and streams bounded "pokemon-dump" chunks. Read-only.
namespace {
using namespace pgr_shared_meta;

struct Failure {const char *where;};
void require(bool ok,const char *where){if(!ok)throw Failure{where};}

constexpr int kSlot=28;
constexpr size_t kChunkBytes=192*1024;  // fits multiple times inside even a 512 KiB queue budget
constexpr uint64_t kChunkGapMs=150;
PgrBootBinding boot{};const PgrSharedMetadataOutput *md=nullptr;
uint64_t last_token=0;
std::vector<float> cpm;  // cpm[i] = CP multiplier at level i+1
std::map<int,std::string> cached_moves;
struct PendingStream {
 std::vector<std::string> chunks;
 size_t index=0;
 uint64_t next_send_ms=0;
 void clear(){chunks.clear();index=0;next_send_ms=0;}
} pending;

uint64_t now_ms(){timespec t{};clock_gettime(CLOCK_MONOTONIC,&t);return uint64_t(t.tv_sec)*1000+uint64_t(t.tv_nsec)/1000000;}

template<class F>F fn(void *p){require(p,"missing runtime export");return reinterpret_cast<F>(p);}
void *exp(const char *name){std::string n="il2cpp_";n+=name;void *p=dlsym(boot.handle,n.c_str());require(p,name);return p;}
struct Root {
 uintptr_t h=0;
 Root()=default;explicit Root(void *v){if(v){h=fn<uintptr_t(*)(void*,int)>(boot.runtime.gchandle_new)(v,0);require(h,"GC root");}}
 Root(const Root&)=delete;Root& operator=(const Root&)=delete;
 Root(Root &&r) noexcept:h(r.h){r.h=0;}
 Root& operator=(Root &&r) noexcept {if(this!=&r){reset();h=r.h;r.h=0;}return *this;}
 ~Root(){reset();}void reset(){if(h){fn<void(*)(uintptr_t)>(boot.runtime.gchandle_free)(h);h=0;}}
 void *get()const{return h?fn<void*(*)(uintptr_t)>(boot.runtime.gchandle_get_target)(h):nullptr;}
 explicit operator bool()const{return get()!=nullptr;}
};
void *klass(void *o){require(o,"null object");return fn<void*(*)(void*)>(boot.runtime.object_get_class)(o);}
void *cls(const char *ns,const char *name){
 static std::map<std::string,void*> cache;std::string key=std::string(ns)+"."+name;auto it=cache.find(key);if(it!=cache.end())return it->second;
 const auto *api=static_cast<const PgrMetaApi*>(pgrazor_runtime_metadata_api(1));require(api,"metadata API");
 PgrMetaClassQuery q{};q.version=1;q.size=sizeof(q);q.name_space=ns;q.name=name;q.canonical_match=PGR_MD_MATCH_EXACT;
 PgrMetaClassResult out{};require(api->resolve_class(&q,&out)==0,name);return cache[key]=const_cast<void*>(out.klass);
}
void *field_of(void *o,const char *name){void *f=fn<void*(*)(void*,const char*)>(boot.meta.class_get_field_from_name)(klass(o),name);require(f,name);return f;}
template<class T>T get(void *o,const char *name){T v{};fn<void(*)(void*,void*,void*)>(boot.runtime.field_get_value)(o,field_of(o,name),&v);return v;}
template<class T>T at(void *o,size_t offset){T v{};std::memcpy(&v,static_cast<char*>(o)+offset,sizeof(v));return v;}
template<class T>T unbox(void *o){require(o,"boxed value");void *p=fn<void*(*)(void*)>(boot.runtime.object_unbox)(o);require(p,"boxed value");T v{};std::memcpy(&v,p,sizeof(v));return v;}
void *method(void *k,const char *name,int count){void *m=fn<void*(*)(void*,const char*,int)>(boot.meta.class_get_method_from_name)(k,name,count);require(m,name);return m;}
void *invoke(void *m,void *o,void **args=nullptr){void *ex=nullptr;void *v=fn<void*(*)(void*,void*,void**,void**)>(boot.runtime.runtime_invoke)(m,o,args,&ex);require(!ex,"managed call failed");return v;}
void *call(void *o,const char *name,int n=0,void **args=nullptr){return invoke(method(klass(o),name,n),o,args);}
void append_utf8(std::string &s,uint32_t c){
 if(c<128)s+=char(c);
 else if(c<2048){s+=char(0xc0|(c>>6));s+=char(0x80|(c&63));}
 else if(c<65536){s+=char(0xe0|(c>>12));s+=char(0x80|((c>>6)&63));s+=char(0x80|(c&63));}
 else{s+=char(0xf0|(c>>18));s+=char(0x80|((c>>12)&63));s+=char(0x80|((c>>6)&63));s+=char(0x80|(c&63));}
}
std::string string(void *o){
 if(!o)return {};require(klass(o)==cls("System","String"),"string identity");
 const int n=fn<int(*)(void*)>(exp("string_length"))(o);require(n>=0&&n<=512,"string bound");
 const uint16_t *p=fn<const uint16_t*(*)(void*)>(boot.runtime.string_chars)(o);std::string s;
 for(int i=0;i<n;i++){
  uint32_t c=p[i];
  if(c>=0xd800&&c<=0xdbff){require(i+1<n&&p[i+1]>=0xdc00&&p[i+1]<=0xdfff,"invalid UTF16");c=0x10000+((c-0xd800)<<10)+(p[++i]-0xdc00);}
  else require(c<0xdc00||c>0xdfff,"invalid UTF16");
  append_utf8(s,c);
 }
 return s;
}
void *h(unsigned id){return const_cast<void*>(md->opt_handles[id]);}
Root type_object(void *k){return Root(fn<void*(*)(void*)>(exp("type_get_object"))(fn<void*(*)(void*)>(boot.meta.class_get_type)(k)));}
Root resolve(void *contract){
 Root type=type_object(h(H_IL_MAP));void *args[]={type.get()};Root map(invoke(h(H_IL_FIND_M),nullptr,args));if(!map)return {};
 Root container(invoke(h(H_IL_CONTAINER_M),map.get()));if(!container)return {};
 Root target=type_object(contract);void *resolve_args[]={target.get()};return Root(invoke(h(H_IL_RESOLVE_M),container.get(),resolve_args));
}
Root resolve(const char *ns,const char *name){return resolve(cls(ns,name));}

// The owned Pokemon in the live bag. Eggs are not Pokemon yet and are left out by the caller.
std::vector<void*> owned(Root &hold){
 Root bag=resolve("Niantic.Holoholo","IPokemonBag");require(bool(bag),"Pokemon storage unavailable");
 Root all(call(bag.get(),"get_AllPokemon"));require(bool(all),"Pokemon storage list unavailable");
 void *k=klass(all.get());
 const int n=unbox<int>(invoke(method(k,"get_Count",0),all.get()));require(n>=0&&n<=30000,"Pokemon storage size");
 void *pokemon=cls("Holoholo.Rpc","PokemonProto");
 hold=Root(fn<void*(*)(void*,uintptr_t)>(exp("array_new"))(pokemon,uintptr_t(n)));require(bool(hold),"storage copy");
 int zero=0;void *args[]={hold.get(),&zero};invoke(method(k,"CopyTo",2),all.get(),args);
 std::vector<void*> out;out.reserve(size_t(n));
 for(int i=0;i<n;i++){void *p=at<void*>(hold.get(),0x20+size_t(i)*8);if(p&&klass(p)==pokemon)out.push_back(p);}
 return out;
}

void load_levels(void *gm){
 if(!cpm.empty())return;
 require(unbox<bool>(call(gm,"get_IsReady")),"game master not ready");
 void *at_level=method(cls("Niantic.Holoholo","GameMasterDataExt_PlayerLevelSettings"),"CpMultiplierAtLevel",2);
 std::vector<float> table;
 for(int level=1;level<=100;level++){
  void *args[]={gm,&level};void *ex=nullptr;
  void *boxed=fn<void*(*)(void*,void*,void**,void**)>(boot.runtime.runtime_invoke)(at_level,nullptr,args,&ex);
  if(ex||!boxed)break;  // past the last level
  const float v=unbox<float>(boxed);
  if(!std::isfinite(v)||v<=0||(!table.empty()&&v<=table.back()))break;
  table.push_back(v);
 }
 require(table.size()>=40,"level table");
 cpm.swap(table);
}
// Twice the level, plus one for a half level; -1 when the multiplier matches no table entry.
int level_half(float multiplier){
 if(!std::isfinite(multiplier)||multiplier<=0)return -1;
 const double m=multiplier;
 for(size_t i=0;i<cpm.size();i++){
  if(std::fabs(cpm[i]-m)<0.00002)return int(i+1)*2;
  if(i+1<cpm.size()&&std::fabs(std::sqrt((double(cpm[i])*cpm[i]+double(cpm[i+1])*cpm[i+1])/2.0)-m)<0.00002)return int(i+1)*2+1;
 }
 return -1;
}

void *enum_class_of_field(void *owner_class,const char *field_name){
 if(!owner_class)return nullptr;
 void *f=fn<void*(*)(void*,const char*)>(boot.meta.class_get_field_from_name)(owner_class,field_name);
 void *t=f?fn<void*(*)(void*)>(boot.meta.field_get_type)(f):nullptr;
 void *ek=t?fn<void*(*)(void*)>(boot.meta.class_from_type)(t):nullptr;
 return (ek&&fn<bool(*)(void*)>(boot.meta.class_is_enum)(ek))?ek:nullptr;
}

// Resolves move enum via PokemonProto.move1_ first, then Holoholo.Rpc.HoloPokemonMove / PokemonMove.
void *move_enum_class(){
 try{
  if(void *ek=enum_class_of_field(cls("Holoholo.Rpc","PokemonProto"),"move1_"))return ek;
 }catch(const Failure&){}
 const char *candidates[]={"HoloPokemonMove","PokemonMove"};
 for(const char *name:candidates){
  try{return cls("Holoholo.Rpc",name);}catch(const Failure&){}
 }
 return nullptr;
}

// Move names come from the game's HoloPokemonMove enum ("V0224MovePoisonJabFast" -> "POISON_JAB_FAST").
// Cached per process; returns false when no named literals are found, so the caller writes numeric ids instead.
bool read_move_names(){
 if(!cached_moves.empty())return true;
 void *k=move_enum_class();
 if(!k)return false;
 auto next_field=fn<void*(*)(void*,void**)>(exp("class_get_fields"));auto name_of=fn<const char*(*)(void*)>(exp("field_get_name"));
 void *iter=nullptr;
 while(void *f=next_field(k,&iter)){
  if((fn<int(*)(void*)>(boot.meta.field_get_flags)(f)&0x8050)!=0x8050)continue;  // static literal: one enum value
  int value=0;fn<void(*)(void*,void*)>(boot.runtime.field_static_get_value)(f,&value);
  std::string formatted=pgr_format_pokemon_move_name(name_of(f));
  if(!formatted.empty())cached_moves.emplace(value,std::move(formatted));
 }
 return !cached_moves.empty();
}
int shadow_alignment_value(void *display_class){
 static int shadow_value=-2;  // -2 unresolved, -1 unavailable
 if(shadow_value!=-2)return shadow_value;
 void *ek=enum_class_of_field(display_class,"Alignment");
 void *lit=ek?fn<void*(*)(void*,const char*)>(boot.meta.class_get_field_from_name)(ek,"Shadow"):nullptr;
 if(lit&&(fn<int(*)(void*)>(boot.meta.field_get_flags)(lit)&0x8050)==0x8050){
  int v=0;fn<void(*)(void*,void*)>(boot.runtime.field_static_get_value)(lit,&v);
  if(v>0)return shadow_value=v;
 }
 return shadow_value=-1;
}
std::string move_name(int id,bool named){
 if(!id)return "";
 if(named){auto it=cached_moves.find(id);if(it!=cached_moves.end())return it->second;}
 return std::to_string(id);
}
std::string json_string(const std::string &s){
 std::string out="\"";
 for(unsigned char c:s){if(c=='"'||c=='\\')out+='\\';if(c>=32)out+=char(c);}
 return out+"\"";
}

std::vector<std::string> dump(uint64_t token){
 Root gm=resolve("","IGameMasterData");require(bool(gm),"game master unavailable");
 load_levels(gm.get());
 const bool named=read_move_names();
 Root hold;std::vector<std::string> rows;
 for(void *p:owned(hold)){
  if(get<bool>(p,"isEgg_"))continue;
  void *display=get<void*>(p,"pokemonDisplay_");
  const int shadow_val=display?shadow_alignment_value(klass(display)):-1;
  const bool shadow=display&&shadow_val>0&&get<int>(display,"Alignment")==shadow_val;
  const float multiplier=get<float>(p,"cpMultiplier_")+get<float>(p,"additionalCpMultiplier_");
  rows.push_back("{\"dex\":"+std::to_string(get<int>(p,"pokemonId_"))
   +",\"shadow\":"+(shadow?"true":"false")
   +",\"cp\":"+std::to_string(get<int>(p,"cp_"))
   +",\"levelHalf\":"+std::to_string(level_half(multiplier))
   +",\"atk\":"+std::to_string(get<int>(p,"individualAttack_"))
   +",\"def\":"+std::to_string(get<int>(p,"individualDefense_"))
   +",\"hp\":"+std::to_string(get<int>(p,"individualStamina_"))
   +",\"fast\":"+json_string(move_name(get<int>(p,"move1_"),named))
   +",\"charged\":["+json_string(move_name(get<int>(p,"move2_"),named))+","+json_string(move_name(get<int>(p,"move3_"),named))+"]"
   +",\"nickname\":"+json_string(string(get<void*>(p,"nickname_")))+"}");
 }
 return pgr_build_pokemon_dump_chunks(token,named,rows,kChunkBytes);
}

uint64_t parse_token(const char *s,uint32_t len){
 if(len<3||len>20||s[0]!='D'||s[1]!='|')return 0;
 uint64_t v=0;
 for(uint32_t i=2;i<len;i++){if(s[i]<'0'||s[i]>'9')return 0;v=v*10+uint64_t(s[i]-'0');}
 return v;
}
int publish(const PgrRuntimeTransportApi *tr,const std::string &json){
 const char kind[]="pokemon-dump";
 PgrRuntimeTransportString a[]={{kind,sizeof(kind)-1},{json.c_str(),uint32_t(json.size())}};
 return tr?tr->emit(19,nullptr,0,a,2):PGR_TRANSPORT_ERR_NOT_INSTALLED;
}
} // namespace

void pgr_pokemon_dump_tick(uint64_t tid,const PgrSharedMetadataOutput *metadata){
 if(!tid||tid!=uint64_t(gettid()))return;
 const auto tr=static_cast<const PgrRuntimeTransportApi*>(pgrazor_runtime_transport_api(1));
 if(!tr)return;
 char text[32]{};uint32_t len=0;
 if(tr->get_string(kSlot,text,sizeof(text),&len)==PGR_TRANSPORT_OK){
  const uint64_t token=parse_token(text,len);
  if(token&&token!=last_token){
   last_token=token;
   pending.clear();
   try{
    auto api=static_cast<const PgrBootApi*>(pgrazor_runtime_bootstrap_api(1));
    require(api&&api->snapshot(&boot)==0,"runtime bootstrap");md=metadata;require(md,"shared metadata");
    pending.chunks=dump(token);
   }catch(const Failure &e){
    pending.chunks.push_back("{\"token\":"+std::to_string(token)+",\"phase\":\"error\",\"message\":"+json_string(e.where)+"}");
   }catch(...){
    pending.chunks.push_back("{\"token\":"+std::to_string(token)+",\"phase\":\"error\",\"message\":\"Pokemon export stopped after an unexpected error\"}");
   }
  }
 }
 if(pending.index>=pending.chunks.size())return;
 const uint64_t now=now_ms();
 if(now<pending.next_send_ms)return;
 const int rc=publish(tr,pending.chunks[pending.index]);
 if(rc==PGR_TRANSPORT_OK){
  if(++pending.index>=pending.chunks.size())pending.clear();
  else pending.next_send_ms=now+kChunkGapMs;
 }else if(rc==PGR_TRANSPORT_STOPPED||rc==PGR_TRANSPORT_ERR_TOO_LARGE){
  pending.clear();
 }else{
  pending.next_send_ms=now+kChunkGapMs;
 }
}
