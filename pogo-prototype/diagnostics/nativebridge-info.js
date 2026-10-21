// Read-only native x64 diagnostics. Evaluate, then explicitly call
// FieldPadNativeBridgeInfo.run(). No library loading or interception occurs.
(function (root) {
    'use strict';
    const QUERY_NAMES = ['default', 'system', 'classloader-namespace', 'classloader-namespace-shared', 'sphal', 'vndk'];
    const API_NAMES = ['NativeBridgeAvailable', 'NativeBridgeInitialized', 'NativeBridgeGetVersion',
        'NativeBridgeLoadLibrary', 'NativeBridgeLoadLibraryExt', 'NativeBridgeGetExportedNamespace',
        'NativeBridgeGetTrampoline', 'NativeBridgeGetError'];
    function run() {
        const result = { kind: 'nativebridge-info', arch: Process.arch, pointerSize: Process.pointerSize,
            time: new Date().toISOString(), status: 'initializing', exports: {}, namespaces: [], nativeLoaderExports: [] };
        function finish() { console.log('[fieldpad-nativebridge] ' + JSON.stringify(result)); return result; }
        if (Process.arch !== 'x64' || Process.pointerSize !== 8) {
            result.status = 'skipped'; result.reason = 'native-x64-required'; return finish();
        }
        try {
            const bridge = Process.findModuleByName('libnativebridge.so');
            if (!bridge) { result.status = 'skipped'; result.reason = 'bridge-not-loaded'; return finish(); }
            result.module = bridge.path;
            const addresses = {};
            for (const name of API_NAMES) {
                const address = bridge.findExportByName(name);
                addresses[name] = address;
                result.exports[name] = address === null ? null : address.toString();
            }
            for (const name of ['NativeBridgeAvailable', 'NativeBridgeInitialized']) {
                const address = addresses[name];
                result[name] = address && !address.isNull() ? new NativeFunction(address, 'bool', [])() : null;
            }
            if (addresses.NativeBridgeGetVersion && !addresses.NativeBridgeGetVersion.isNull()) {
                result.version = new NativeFunction(addresses.NativeBridgeGetVersion, 'uint32', [])();
            }
            const getter = addresses.NativeBridgeGetExportedNamespace;
            if (result.NativeBridgeInitialized && getter && !getter.isNull()) {
                const getNamespace = new NativeFunction(getter, 'pointer', ['pointer']);
                for (const name of QUERY_NAMES) {
                    const namespace = getNamespace(Memory.allocUtf8String(name));
                    result.namespaces.push({ name: name, address: namespace.isNull() ? null : namespace.toString() });
                }
            }
            const loader = Process.findModuleByName('libnativeloader.so');
            if (loader) {
                result.nativeLoaderModule = loader.path;
                result.nativeLoaderExports = loader.enumerateExports().filter(e =>
                    e.type === 'function' && /FindNativeLoaderNamespaceByClassLoader|OpenNativeLibraryInNamespace|IsNamespaceNativeBridged|OpenNativeLibrary/.test(e.name)
                ).slice(0, 16).map(e => ({ name: e.name, address: e.address.toString() }));
            }
            result.status = 'complete';
        } catch (error) { result.status = 'error'; result.error = String(error); }
        return finish();
    }
    root.FieldPadNativeBridgeInfo = Object.freeze({ run: run });
})(globalThis);
globalThis.FieldPadNativeBridgeInfo;
