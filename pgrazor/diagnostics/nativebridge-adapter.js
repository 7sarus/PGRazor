// Disposable diagnostic only. Install explicitly with one verified agent path.
'use strict';
let module, state, originalSlot, expected, target;
rpc.exports = {
  info() {
    const b=Process.getModuleByName('libnativebridge.so');
    return {arch:Process.arch, initialized:new NativeFunction(b.getExportByName('NativeBridgeInitialized'),'bool',[])(),
      version:new NativeFunction(b.getExportByName('NativeBridgeGetVersion'),'uint',[])()};
  },
  install(path) {
    if(module) throw new Error('Already installed');
    if(Process.arch!=='x64' || !path.startsWith('/data/local/tmp/') || !path.endsWith('/frida-agent-arm64.so')) throw new Error('Unexpected architecture or agent path');
    const b=Process.getModuleByName('libnativebridge.so');
    if(!new NativeFunction(b.getExportByName('NativeBridgeInitialized'),'bool',[])()) throw new Error('Bridge not initialized');
    state=Memory.alloc(560); originalSlot=Memory.alloc(Process.pointerSize); expected=Memory.allocUtf8String(path);
    target=b.getExportByName('NativeBridgeLoadLibrary');
    originalSlot.writePointer(target);
    module=new CModule(`
      typedef void *(*Loader)(const char *, int);
      typedef struct { volatile unsigned calls, matches, active, finished; void *result; char error[512]; } State;
      extern State state;
      extern void *original_slot;
      extern const char expected[];
      extern void *load_ext(const char *, int, void *);
      extern const char *get_error(void);
      static int same(const char *a,const char *b) { if(!a || !b)return 0; unsigned i=0; for(;i<1024;i++){if(a[i]!=b[i])return 0;if(!a[i])return 1;}return 0; }
      void *replacement(const char *path,int flags) {
        state.calls++;
        if(!same(path,expected)) return ((Loader)original_slot)(path,flags);
        state.matches++; state.active=1;
        void *result=load_ext(path,flags,(void *)0);
        state.result=result;
        if(!result){const char *e=get_error();unsigned i=0;if(e){for(;i<511 && e[i];i++)state.error[i]=e[i];}state.error[i]=0;}
        state.finished=1;state.active=0;return result;
      }
    `,{state,original_slot:originalSlot,expected,load_ext:b.getExportByName('NativeBridgeLoadLibraryExt'),get_error:b.getExportByName('NativeBridgeGetError')});
    originalSlot.writePointer(Interceptor.replaceFast(target,module.replacement));
    Interceptor.flush();
    return {installed:true,path};
  },
  snapshot() { return state ? {calls:state.readU32(),matches:state.add(4).readU32(),active:state.add(8).readU32(),finished:state.add(12).readU32(),result:state.add(16).readPointer().toString(),error:state.add(24).readUtf8String(512)} : {installed:false}; },
  stop() { if(!module)return {stopped:true};if(state.add(8).readU32())throw new Error('Native loader still active; retain script');Interceptor.revert(target);Interceptor.flush();return {stopped:true}; }
};
