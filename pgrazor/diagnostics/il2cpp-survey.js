// Opt-in metadata survey. Loading this file performs no native calls.
// Explicitly call PGRazorIl2CppSurvey.start({ enabled: true }).
(function (root) {
    'use strict';
    const LIMITS = Object.freeze({ attempts: 20, retryMs: 1000, durationMs: 20000,
        assemblies: 128, classes: 8, methodsPerClass: 80, methods: 320,
        lookups: 1024, scanMs: 4000, nameBytes: 256 });
    const CANDIDATES = Object.freeze([
        ['UnityEngine', 'Camera'], ['UnityEngine', 'Component'], ['UnityEngine', 'Transform'],
        ['Niantic.Holoholo.CameraRig', 'MainCameraRig'],
        ['Niantic.Holoholo.Encounter', 'EncounterCaptureState'],
        ['Niantic.Holoholo.Pokestop', 'PokestopSpinnerInteractionState'],
        ['Niantic.Holoholo.Pokestop', 'PokestopResolveState'],
        ['Niantic.Holoholo.Pokestop', 'PokestopInteractionState']
    ]);
    const SIGNATURES = {
        domain_get: ['pointer', []],
        domain_get_assemblies: ['pointer', ['pointer', 'pointer']],
        assembly_get_image: ['pointer', ['pointer']],
        image_get_name: ['pointer', ['pointer']],
        class_from_name: ['pointer', ['pointer', 'pointer', 'pointer']],
        class_get_methods: ['pointer', ['pointer', 'pointer']],
        method_get_name: ['pointer', ['pointer']],
        method_get_param_count: ['uint32', ['pointer']],
        thread_current: ['pointer', []],
        thread_attach: ['pointer', ['pointer']],
        thread_detach: ['void', ['pointer']]
    };
    let running = null;

    function emit(kind, fields, sink) {
        const event = Object.assign({
            time: new Date().toISOString(), kind: kind
        }, fields || {});
        console.log('[pgrazor-il2cpp-survey] ' + JSON.stringify(event));
        const callback = sink || (running && running.onEvent);
        if (typeof callback === 'function') {
            try { callback(event); } catch (_) { /* Diagnostics must not abort the survey. */ }
        }
    }
    function name(pointer) {
        if (pointer.isNull()) return '<null>';
        // Frida's explicit string length is exact, not a maximum. Locate the
        // terminator within our bound so adjacent metadata is never logged.
        let length = 0;
        while (length < LIMITS.nameBytes && pointer.add(length).readU8() !== 0) length++;
        if (length === 0) return '';
        return pointer.readCString(length) + (length === LIMITS.nameBytes ? '[truncated]' : '');
    }
    function bind(module) {
        const api = {};
        for (const key of Object.keys(SIGNATURES)) {
            const address = module.findExportByName('il2cpp_' + key);
            if (!address || address.isNull()) throw new Error('Missing export il2cpp_' + key);
            const spec = SIGNATURES[key];
            api[key] = new NativeFunction(address, spec[0], spec[1]);
        }
        return api;
    }
    function nativeArm64(module) {
        const bytes = new Uint8Array(module.base.readByteArray(20));
        return bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c &&
            bytes[3] === 0x46 && bytes[4] === 2 && bytes[5] === 1 &&
            bytes[18] === 183 && bytes[19] === 0;
    }
    function survey(api, domain) {
        let attached = null;
        try {
            if (api.thread_current().isNull()) {
                attached = api.thread_attach(domain);
                if (attached.isNull()) throw new Error('IL2CPP thread attachment returned null');
            }
            // size_t*, not uint32_t*: native ARM64 needs eight writable bytes.
            const countPointer = Memory.alloc(Process.pointerSize);
            countPointer.writeU64(0);
            const assemblies = api.domain_get_assemblies(domain, countPointer);
            const count64 = countPointer.readU64();
            if (count64.compare(0) === 0) return { retry: 'assemblies-not-ready' };
            if (assemblies.isNull()) throw new Error('Assembly list is null with nonzero count');
            const total = count64.toString();
            const count = count64.compare(LIMITS.assemblies) > 0 ? LIMITS.assemblies : count64.toNumber();
            const summary = { status: 'complete', assembliesReported: total, assembliesScanned: 0,
                classes: 0, methods: 0, lookups: 0, truncated: count64.compare(count) > 0 };
            const deadline = Date.now() + LIMITS.scanMs;
            const names = CANDIDATES.map(pair => pair.map(value => Memory.allocUtf8String(value)));
            const found = new Set();
            outer: for (let i = 0; i < count; i++) {
                if (Date.now() >= deadline) { summary.truncated = true; break; }
                const assembly = assemblies.add(i * Process.pointerSize).readPointer();
                if (assembly.isNull()) continue;
                const image = api.assembly_get_image(assembly);
                if (image.isNull()) continue;
                summary.assembliesScanned++;
                const imageName = name(api.image_get_name(image));
                for (let c = 0; c < CANDIDATES.length; c++) {
                    if (found.has(c)) continue;
                    if (Date.now() >= deadline || summary.lookups >= LIMITS.lookups ||
                        summary.classes >= LIMITS.classes || summary.methods >= LIMITS.methods) {
                        summary.truncated = true; break outer;
                    }
                    summary.lookups++;
                    const klass = api.class_from_name(image, names[c][0], names[c][1]);
                    if (klass.isNull()) continue;
                    found.add(c);
                    summary.classes++;
                    const className = CANDIDATES[c].join('.');
                    emit('class', { assembly: imageName, className: className });
                    const iterator = Memory.alloc(Process.pointerSize);
                    iterator.writePointer(ptr(0));
                    let ended = false;
                    for (let m = 0; m < LIMITS.methodsPerClass && summary.methods < LIMITS.methods; m++) {
                        if (Date.now() >= deadline) { summary.truncated = true; break outer; }
                        const method = api.class_get_methods(klass, iterator);
                        if (method.isNull()) { ended = true; break; }
                        emit('method', { assembly: imageName, className: className,
                            name: name(api.method_get_name(method)),
                            parameterCount: api.method_get_param_count(method) });
                        summary.methods++;
                    }
                    if (!ended) {
                        summary.truncated = true;
                        emit('class-limit', { className: className });
                    }
                }
            }
            summary.missingCandidates = CANDIDATES.filter((_, index) => !found.has(index)).map(pair => pair.join('.'));
            return summary;
        } finally {
            // Never detach an existing host/Unity thread. Do not carry an attachment
            // across retry timers: each attempt owns and releases its own attachment.
            if (attached !== null && !attached.isNull()) api.thread_detach(attached);
        }
    }
    function start(options) {
        if (!options || options.enabled !== true) return Promise.resolve({ status: 'disabled' });
        if (running !== null) return Promise.resolve({ status: 'already-running' });
        if (Process.arch !== 'arm64' || Process.pointerSize !== 8) {
            const result = { status: 'skipped', reason: 'native-arm64-required', arch: Process.arch };
            emit('finished', result, options.onEvent); return Promise.resolve(result);
        }
        return new Promise(resolve => {
            const state = { attempts: 0, timer: null, deadline: Date.now() + LIMITS.durationMs,
                finish: null, onEvent: options.onEvent };
            running = state;
            state.finish = result => {
                if (running !== state) return;
                if (state.timer !== null) clearTimeout(state.timer);
                running = null;
                emit('finished', result, state.onEvent);
                resolve(result);
            };
            function attempt() {
                if (running !== state) return;
                state.timer = null;
                state.attempts++;
                try {
                    const module = Process.findModuleByName('libil2cpp.so');
                    let result;
                    if (!module) result = { retry: 'library-not-loaded' };
                    else if (!nativeArm64(module)) {
                        state.finish({ status: 'skipped', reason: 'library-architecture-mismatch' }); return;
                    } else {
                        const api = bind(module);
                        const domain = api.domain_get();
                        result = domain.isNull() ? { retry: 'domain-not-ready' } : survey(api, domain);
                    }
                    if (!result.retry) { state.finish(result); return; }
                    if (state.attempts >= LIMITS.attempts || Date.now() + LIMITS.retryMs > state.deadline) {
                        state.finish({ status: 'skipped', reason: result.retry, attempts: state.attempts }); return;
                    }
                    state.timer = setTimeout(attempt, LIMITS.retryMs);
                } catch (error) {
                    state.finish({ status: 'error', message: String(error), attempts: state.attempts });
                }
            }
            attempt();
        });
    }
    function stop() {
        if (running !== null) running.finish({ status: 'cancelled' });
    }
    root.PGRazorIl2CppSurvey = Object.freeze({ start: start, stop: stop, limits: LIMITS });
})(globalThis);
// Script.evaluate returns this object; standalone REPL can call the global name.
globalThis.PGRazorIl2CppSurvey;
