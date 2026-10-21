// Temporary diagnostic: observe the bridge loader's filename and failure only.
// No library request is altered. Script unload removes the listener.
'use strict';
if (Process.arch !== 'x64') throw new Error('Native x64 session required');
const bridge = Process.getModuleByName('libnativebridge.so');
const errorAddress = bridge.getExportByName('NativeBridgeGetError');
const getError = new NativeFunction(errorAddress, 'pointer', []);
Interceptor.attach(bridge.getExportByName('NativeBridgeLoadLibrary'), {
    onEnter(args) {
        this.path = args[0].readUtf8String();
        send({kind:'bridge-load-request', path:this.path, flags:args[1].toInt32()});
    },
    onLeave(result) {
        let detail = null;
        if (result.isNull()) {
            const error = getError();
            if (!error.isNull()) detail = error.readUtf8String();
        }
        send({kind:'bridge-load-result', path:this.path, handle:result.toString(), error:detail});
    }
});
send({kind:'bridge-observer-ready'});
