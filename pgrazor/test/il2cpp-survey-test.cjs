const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../diagnostics/il2cpp-survey.js'), 'utf8');
function fixture(options = {}) {
    const calls = [], events = [], timers = new Map(); let timerId = 0, now = 0;
    const stats = { attached: 0, detached: 0, allocSizes: [], countWrites: 0, lookups: 0 };
    class U64 {
        constructor(n) { this.n = BigInt(n); }
        compare(n) { n = BigInt(n); return this.n < n ? -1 : this.n > n ? 1 : 0; }
        toString() { return String(this.n); }
        toNumber() { assert(this.n <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(this.n); }
    }
    class Pointer {
        constructor(value) { this.value = value; }
        isNull() { return this.value === null || this.value === 0; }
        readCString(length) { assert(length <= 256); return String(this.value).slice(0, length); }
        writePointer(p) { this.pointer = p; this.index = 0; }
        writeU64(n) { assert.equal(this.bytes, 8, 'size_t count requires 8 bytes'); this.number = BigInt(n); stats.countWrites++; }
        readU64() { return new U64(this.number); }
        add(offset) {
            if(this.value !== 'assemblies') return {readU8:()=>{
                assert(offset < 256,'Name reads must stay bounded');
                const value=String(this.value); return offset>=value.length?0:value.charCodeAt(offset);
            }};
            assert.equal(offset % 8, 0); return { readPointer: () => new Pointer({ assembly: offset / 8 }) };
        }
        readByteArray(count) {
            assert.equal(count, 20); const bytes = new Uint8Array(20);
            bytes.set([127, 69, 76, 70, 2, 1]); bytes[18] = options.wrongMachine ? 62 : 183;
            return bytes.buffer;
        }
    }
    const nil = () => new Pointer(null);
    const api = {
        domain_get: () => options.noDomain ? nil() : new Pointer('domain'),
        thread_current: () => options.existingThread ? new Pointer('existing-thread') : nil(),
        thread_attach: () => { stats.attached++; return options.attachFails ? nil() : new Pointer('owned-thread'); },
        thread_detach: p => { assert.equal(p.value, 'owned-thread'); stats.detached++; },
        domain_get_assemblies: (domain, count) => {
            assert.equal(count.bytes, 8); count.number = BigInt(options.assemblyCount ?? 1);
            return options.nullAssemblyList ? nil() : new Pointer('assemblies');
        },
        assembly_get_image: assembly => new Pointer({ image: assembly.value.assembly }),
        image_get_name: () => new Pointer(options.imageName ?? 'Assembly-CSharp.dll\0AdjacentMetadata'),
        class_from_name: (image, ns, name) => {
            stats.lookups++;
            if (options.throwLookup) throw Error('Synthetic lookup failure');
            if (options.noClasses) return nil();
            return new Pointer({ name: name.value, namespace: ns.value });
        },
        class_get_methods: (klass, iter) => {
            if (options.throwMethod) throw Error('Synthetic method failure');
            const index = iter.index++;
            return index < (options.methodsPerClass ?? 2) ? new Pointer({ method: index }) : nil();
        },
        method_get_name: method => new Pointer('method_' + method.value.method),
        method_get_param_count: method => method.value.method
    };
    const module = { base: new Pointer('elf'), findExportByName(full) {
        if (full === options.missingExport) return null;
        const key = full.replace(/^il2cpp_/, '');
        assert(key in api, 'Unexpected API ' + key);
        return new Pointer(key);
    } };
    const signatures = [];
    const context = {
        Process: { arch: options.arch || 'arm64', pointerSize: options.pointerSize || 8,
            findModuleByName(name) { calls.push('module'); assert.equal(name, 'libil2cpp.so'); return options.noModule ? null : module; } },
        Memory: { alloc(bytes) { stats.allocSizes.push(bytes); const p = new Pointer('allocation'); p.bytes = bytes; return p; },
            allocUtf8String: text => new Pointer(text) },
        ptr: value => new Pointer(value),
        NativeFunction: function (address, result, args) {
            signatures.push([address.value, result, args]);
            return (...values) => { calls.push(address.value); return api[address.value](...values); };
        },
        console: { log(line) { events.push(JSON.parse(line.slice(line.indexOf('{')))); } },
        Date: class extends Date { static now() { return now; } },
        setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
        clearTimeout(id) { timers.delete(id); },
        Uint8Array
    };
    const exported = vm.runInNewContext(source, context);
    return { api: exported, context, stats, calls, signatures, events, timers,
        tick() { const [id, item] = timers.entries().next().value; timers.delete(id); now += item.ms; item.fn(); } };
}
async function main() {
    const idle = fixture(); assert.equal(idle.calls.length, 0);
    assert.equal((await idle.api.start()).status, 'disabled'); assert.equal(idle.calls.length, 0);
    assert.equal((await idle.api.start({ enabled: 1 })).status, 'disabled');
    const x64 = fixture({ arch: 'x64' });
    assert.equal((await x64.api.start({ enabled: true })).reason, 'native-arm64-required');
    assert.equal(x64.calls.length, 0);
    const wrong = fixture({ wrongMachine: true });
    assert.equal((await wrong.api.start({ enabled: true })).reason, 'library-architecture-mismatch');
    assert.equal(wrong.signatures.length, 0);
    const received=[];
    const good = fixture(); const result = await good.api.start({ enabled: true, onEvent:event=>received.push(event) });
    assert.deepEqual(JSON.parse(JSON.stringify(received)),good.events,'Durable sink receives every event including terminal result');
    const brokenSink=fixture();
    assert.equal((await brokenSink.api.start({enabled:true,onEvent(){throw Error('Sink failure');}})).status,'complete');
    assert.equal(result.status, 'complete'); assert.equal(result.classes, 8); assert.equal(result.methods, 16);
    assert.equal(good.stats.attached, 1); assert.equal(good.stats.detached, 1);
    assert.equal(good.stats.countWrites, 1); assert(good.stats.allocSizes.every(n => n === 8));
    assert(good.events.some(e => e.kind === 'method' && e.parameterCount === 1));
    assert(good.events.filter(e=>e.assembly).every(e=>e.assembly==='Assembly-CSharp.dll'),'Stop at NUL before adjacent metadata');
    const longName=fixture({imageName:'x'.repeat(300)});await longName.api.start({enabled:true});
    assert.equal(longName.events.find(e=>e.kind==='class').assembly,'x'.repeat(256)+'[truncated]');
    assert(!good.calls.some(name => /invoke|hook|init$|set_/.test(name)));
    const counts = good.signatures.find(s => s[0] === 'method_get_param_count'); assert.equal(counts[1], 'uint32');
    const existing = fixture({ existingThread: true }); await existing.api.start({ enabled: true });
    assert.equal(existing.stats.attached, 0); assert.equal(existing.stats.detached, 0);
    for (const option of ['throwLookup', 'throwMethod', 'nullAssemblyList']) {
        const fail = fixture({ [option]: true });
        assert.equal((await fail.api.start({ enabled: true })).status, 'error');
        assert.equal(fail.stats.attached, 1); assert.equal(fail.stats.detached, 1);
    }
    const attach = fixture({ attachFails: true });
    assert.equal((await attach.api.start({ enabled: true })).status, 'error'); assert.equal(attach.stats.detached, 0);
    const missing = fixture({ missingExport: 'il2cpp_class_get_methods' });
    assert.equal((await missing.api.start({ enabled: true })).status, 'error'); assert.equal(missing.stats.attached, 0);
    const huge = fixture({ assemblyCount: '18446744073709551615', noClasses: true });
    const hugeResult = await huge.api.start({ enabled: true });
    assert.equal(hugeResult.assembliesScanned, 128); assert.equal(hugeResult.lookups, 1024); assert(hugeResult.truncated);
    const methods = fixture({ methodsPerClass: 99999 });
    const limited = await methods.api.start({ enabled: true }); assert.equal(limited.methods, 320); assert(limited.truncated);
    for (const options of [{ noModule: true }, { noDomain: true }, { assemblyCount: 0 }]) {
        const retry = fixture(options); const pending = retry.api.start({ enabled: true });
        assert.equal((await retry.api.start({ enabled: true })).status, 'already-running');
        let ticks = 0; while (retry.timers.size) { retry.tick(); assert(++ticks <= 20); }
        assert.equal((await pending).status, 'skipped');
        assert.equal(retry.stats.attached, retry.stats.detached, 'retry must detach owned thread each time');
    }
    const cancel = fixture({ noModule: true }); const pending = cancel.api.start({ enabled: true });
    cancel.api.stop(); assert.equal((await pending).status, 'cancelled'); assert.equal(cancel.timers.size, 0);
    console.log('PASS: explicit opt-in, ARM64/ELF guards, API types, size_t allocation, thread ownership/cleanup, bounded discovery/retries, cancellation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
