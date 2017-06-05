"use strict";
const Base =require("./Base64x64");
const RON_GRAMMAR = require("./Grammar");
const UUID = require("./UUID");
const Op = require("./Op");

class Frame {

    constructor (body, mode) {
        this._body = body || '';
        this._last_op = Op.ZERO;
        mode = mode || (Frame.ZIP_OPTIONS.VARLEN|Frame.ZIP_OPTIONS.SKIPTOK|Frame.ZIP_OPTIONS.PREFIX);
        this._options = {
            varlen: 0!==(mode & Frame.ZIP_OPTIONS.VARLEN),
            skipquant: 0!==(mode & Frame.ZIP_OPTIONS.SKIPQUANT),
            prefix: 0!==(mode & Frame.ZIP_OPTIONS.PREFIX),
            skiptok: (0!==(mode & Frame.ZIP_OPTIONS.SKIPTOK)), // || (o_prefix&&o_skipquant),
            spaceops: 0!==(mode & Frame.ZIP_OPTIONS.SPACEOPS),
            redefault: 0!==(mode & Frame.ZIP_OPTIONS.REDEFAULT)
        };
    }

    push (new_op) {
        const op = Op.as(new_op);

        let buf = '';
        const opts = this._options;
        //
        // if (opts.spaceops && this._body.length) {
        //     buf += ' ';
        // }
        let last=-2, had_origin=false;

        for(let u=0; u<4; u++) {
            const uid = op.uuid(u);
            let last_uid = this._last_op.uuid(u);
            if (uid.eq(last_uid) && !(!buf && u===3)) {
                continue;
            }

            let zip, def, have_prefix=false;

            for(let l=0; l<4; l++) {
                const redef = l===u ? '' : "`\\|/"[l];
                def = l>0 ? this._last_op.uuid(l) : (u>0?op.uuid(u-1):UUID.ZERO);
                const rezip = redef + uid.toZipString(def);
                if (zip===undefined || rezip.length<zip.length) {
                    zip = rezip;
                    have_prefix = redef.length>0 ||
                        (zip.length>0 && Base.PREFIX_SEPS.indexOf(zip[0])!==-1);
                }
            }

            // reasons to add separator:
            // 1. uuid is long anyway
            // 2. skipped uuid
            // 3. skipped origin
            // 4. non-zipped value
            if (last<u-1 || !had_origin || !have_prefix || zip.length>=10)
                buf += Op.UID_SEPS[u];

            buf += zip;

            last = u;
            had_origin = uid.origin!==def.origin;

        }

        this._body += buf;
        this._body += op.raw_values();

        this._last_op = op;
    }

    pushAll (i) {
        for(let op of i)
            this.push(Op.as(op));
    }

    [Symbol.iterator]() {
        return new Frame.Iterator (this._body);
    }

    static fromString (body) {
        return new Frame(body);
    }

    static fromArray (arr) {
        const ret = new Frame();
        arr.forEach( f => ret.pushAll(Frame.as(f)) );
        return ret;
    }

    static as (frame) {
        if (!frame) return new Frame();
        if (frame.constructor===Frame) return frame;
        if (frame.constructor===Array) return Frame.fromArray(frame);
        return Frame.fromString(frame.toString());
    }

    toString () {
        return this._body;
    }

}

Frame.RE_WSP = /[\s\t]*/g;
Frame.re_terminators = /\n*/g;

Frame.ZIP_OPTIONS = {
    VARLEN: 1,
    SKIPQUANT: 2,
    PREFIX: 4,
    SKIPTOK: 8,
    SPACEOPS: 32,
    REDEFAULT: 16,
    ALLSET: 31
};

class Iterator {

    constructor (body) {
        this._body = body.toString();
        this.op = Op.ZERO;
        this._offset = 0;
        this._index = -1;
        this.nextOp();
    }

    static as (something) {
        if (!something) return new Iterator('');
        if (something.constructor===Iterator) return something;
        return new Iterator(something.toString());
    }

    end () {
        return this.op.isError();
    }

    nextOp () {

        if ( this._offset===this._body.length ) {
            this.op = Iterator.ERROR_END_OP;
            return;
        }

        const re = Iterator.RE_OP;
        re.lastIndex = this._offset;
        const m = re.exec(this._body);
        if (!m || !m[0] || m.index!==this._offset) {
            this.op = Iterator.ERROR_BAD_OP;
            return;
        }
        this._offset += m[0].length;

        const seps = "`\\|/";
        const defaults = [this.op.type, this.op.object, this.op.event, this.op.location];
        const uids = [];
        let prev_uid = UUID.ZERO;
        for(let u=0; u<4; u++) {
            const uid = m[u+1];
            let def = defaults[u];
            if (!uid) {
                uids.push(def);
                continue;
            }
            const s = seps.indexOf(uid[0]);
            if (s!==-1) {
                def = s ? defaults[s] : prev_uid;
            }
            prev_uid = UUID.fromString(uid, def);
            uids.push(prev_uid);
        }

        this.op = new Op(uids[0], uids[1], uids[2], uids[3], m[5]);

        this._index++;
        // FIXME sanity checks
        return this.op;
    }

    nextFrame () {
        const at = this.op;
        const from = this._offset;
        let till = from;
        do {
            till = this._offset;
            this.nextOp();
        } while(this.op.object.eq(at.object));
        const ret = at.toString() + this._body.substring(from, till);
        return ret;
    }

    next () {
        const ret = {
            done: this.op.isError(),
            value: this.op
        };
        if (!ret.done)
            this.nextOp();
        return ret;
    }

}
Frame.Iterator = Frame.Iterator = Iterator;
Iterator.RE_OP = new RegExp("\\s*"+RON_GRAMMAR.pattern("ZIP_OP"), "mg");
Iterator.ERROR_END_OP = new Op(UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR, "END");
Iterator.ERROR_BAD_OP = new Op(UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR, "BAD SYNTAX");


module.exports = Frame;