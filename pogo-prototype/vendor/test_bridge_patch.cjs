// Exercise the exact transformed ARM64 function with deterministic writer stubs.
// This checks code-generation structure, not ART/device compatibility.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = __dirname;
const original = fs.readFileSync(path.join(root, 'frida-java-bridge-original.js'), 'utf8');
const patched = fs.readFileSync(path.join(root, 'frida-java-bridge-302a588.js'), 'utf8');
const receipt = JSON.parse(fs.readFileSync(path.join(root, 'bridge-provenance.json'), 'utf8'));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
assert.equal(sha(original), receipt.source_sha256);
assert.equal(sha(patched), receipt.output_sha256);
let restored = patched;
for (const edit of receipt.changes.toReversed()) {
    assert.equal(restored.split(edit.after).length - 1, 1);
    restored = restored.replace(edit.after, edit.before);
}
assert.equal(restored, original);
const oldMask = 2950692863, newMask = 2949644287, expectedFlags = 281;
assert.equal(newMask >>> 0, (~(0x40000000 | 0x10000000 | 0x00200000 | 0x00100000)) >>> 0);
assert.notEqual(oldMask & (expectedFlags | 0x00100000), expectedFlags);
assert.equal(newMask & (expectedFlags | 0x00100000), expectedFlags);

class Pointer {
    constructor(value) { this.value = value; }
    add(value) { return new Pointer(this.value + value); }
    sub(other) { return new Pointer(this.value - other.value); }
    toInt32() { return this.value; }
    equals(other) { return this.value === other.value; }
    compare(other) { return Math.sign(this.value - other.value); }
    toString() { return String(this.value); }
}
const events = [];
let writer;
class Writer {
    constructor(_, options) { this.offset = 0; this.pc = options.pc; writer = this; }
    emit(kind, value) { events.push([kind, value]); this.offset += 4; }
    putPushAllXRegisters() { this.emit('push-all'); }
    putCallAddressWithArguments(callback, args) { this.emit('callback', [callback, args]); }
    putPopAllXRegisters() { this.emit('pop-all'); }
    putRet() { this.emit('ret'); }
    flush() { events.push(['flush']); this.offset += 8; }
    putPushRegReg() { this.emit('push'); }
    putMovRegReg() { this.emit('move'); }
    putBlImm(target) { this.emit('branch-callback', target.value); }
    putPopRegReg() { this.emit('pop'); }
    dispose() { events.push(['dispose']); }
}
function instruction(pointer) {
    const address = pointer.value;
    assert([100, 104].includes(address));
    return { address: pointer, size: 4, next: pointer.add(4),
        mnemonic: address === 100 ? 'str' : 'ret',
        operands: address === 100 ? [{value:'xzr'}, {value:{base:'x19',disp:16}}] : [] };
}
class Relocator {
    constructor(begin, output) { this.begin = begin; this.output = output; this.offset = 0; }
    readOne() {
        if (this.offset === 8) return 0;
        this.input = instruction(this.begin.add(this.offset));
        this.offset += 4;
        return this.offset;
    }
    skipOne() {}
    writeAll() { this.output.emit('relocated-' + this.input.mnemonic); }
    dispose() {}
}
const marker = 'arm64:function(e,t,n,r,o,i,a){const s={},l=new Set,c=[n];';
assert.equal(patched.split(marker).length - 1, 1);
const start = patched.indexOf(marker) + 'arm64:'.length;
const end = patched.indexOf('}};function Jt', start) + 1;
const context = { Arm64Writer:Writer, Arm64Relocator:Relocator,
    Instruction:{parse:instruction}, ie:136, Ee:{exceptions:'propagate'},
    Gt() { throw Error('Core transition instruction missing'); },
    NativeFunction:function(entry) { this.entry = entry; } };
const implementation = vm.runInNewContext('(' + patched.slice(start,end) + ')', context);
const result = implementation(new Pointer(1000),new Pointer(200),new Pointer(100),new Pointer(108),16,new Set(),'callback');
assert.equal(result.entry.value,224, 'NativeFunction must enter after flushed callback block');
assert.deepEqual(events.slice(0,5).map(e=>e[0]), ['push-all','callback','pop-all','ret','flush']);
assert.equal(events.find(e=>e[0]==='branch-callback')[1],200, 'Relocated body calls callback at start');
assert.equal(events.at(-1)[0],'dispose');
assert(writer.offset > 24);
console.log('PASS: exact hashes, reversible substitutions, API37 access-flag mask, callback literal-pool flush and relocated entry');
