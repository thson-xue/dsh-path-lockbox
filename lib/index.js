// src/index.js
import fs2 from "node:fs";
import path2 from "node:path";
import os from "node:os";

// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path3 = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path: path3 });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path3, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path3, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path3, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path3, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/match.js
var GLOB_CHARS = /[*?[{]/;
function normalizePath(input, { matchCase = false } = {}) {
  if (typeof input !== "string" || !input.trim()) return "";
  let p = input.trim().replace(/\\/g, "/");
  const m = /^\/([a-zA-Z])(\/|$)/.exec(p);
  if (m) p = m[1] + ":" + p.slice(2);
  p = p.replace(/\/{2,}/g, "/");
  if (/^[a-zA-Z]:$/.test(p)) p += "/";
  if (p.length > 3 && p.endsWith("/")) p = p.slice(0, -1);
  return matchCase ? p : p.toLowerCase();
}
function expandTilde(p, home) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return home + p.slice(1);
  return p;
}
function isAbsolute(p) {
  return typeof p === "string" && (/^[a-zA-Z]:\//.test(p) || p.startsWith("/"));
}
function buildEntries(config, { matchCase = false, cwd = "" } = {}) {
  const warnings = [];
  const entries = [];
  const push2 = (kind, raw, defaults = {}) => {
    const rawPath = typeof raw === "string" ? raw : raw?.path;
    const abs = normalizePath(expandTilde(String(rawPath ?? ""), ""), { matchCase });
    if (!abs || !isAbsolute(abs) || GLOB_CHARS.test(abs)) {
      warnings.push(`\u5FFD\u7565\u65E0\u6548\u6761\u76EE ${kind}: ${rawPath}\uFF08\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4E0D\u5E26\u901A\u914D\u7B26\uFF09`);
      return;
    }
    entries.push({
      kind,
      path: abs,
      label: String(rawPath ?? abs),
      recursive: defaults.recursive !== false && raw?.recursive !== false,
      watch: !!(defaults.watch ?? raw?.watch)
    });
  };
  for (const f of config?.files ?? []) push2("file", f);
  for (const f of config?.folders ?? []) push2("folder", f);
  for (const d of config?.drives ?? []) push2("drive", d);
  return { entries, warnings };
}
function entryHits(entry, target) {
  if (entry.kind === "file") return target === entry.path;
  if (entry.kind === "folder") {
    if (target === entry.path) return true;
    if (!entry.recursive) return false;
    const prefix = entry.path.endsWith("/") ? entry.path : entry.path + "/";
    return target.startsWith(prefix);
  }
  if (entry.kind === "drive") {
    return entry.recursive ? target.startsWith(entry.path) : target === entry.path;
  }
  return false;
}
function makeMatcher(entries, { matchCase = false } = {}) {
  const match = (target) => {
    const t = normalizePath(target, { matchCase });
    if (!t) return null;
    let best = null;
    for (const e of entries) {
      if (entryHits(e, t) && (!best || e.path.length > best.path.length)) best = e;
    }
    return best;
  };
  const matchCommandText = (commandText) => {
    if (typeof commandText !== "string" || !commandText.trim()) return null;
    const c = commandText.replace(/\\/g, "/").replace(/\s+/g, " ");
    const needle = matchCase ? c : c.toLowerCase();
    let best = null;
    for (const e of entries) {
      let hit = false;
      if (e.kind === "file") hit = needle.includes(e.path);
      else if (e.kind === "drive") hit = needle.includes(e.path);
      if (hit && (!best || e.path.length > best.path.length)) best = e;
    }
    return best;
  };
  return { match, matchCommandText };
}

// src/extract.js
var TOKEN_SPLIT = /[\s|&;<>()]+/;
function normalizeDir(p, opts) {
  const n = normalizePath(p, opts);
  return n;
}
function resolveToken(tok, anchor, home, opts) {
  if (!tok) return "";
  let t = tok.replace(/\\/g, "/");
  if (t === "~" || t.startsWith("~/")) t = home ? home + t.slice(1) : t;
  if (isAbsolute(t) || t.startsWith("/")) return normalizePath(t, opts);
  if (!anchor) return "";
  return normalizePath(anchor.replace(/\/$/, "") + "/" + t, opts);
}
function extractPathsFromCommand(commandText, { cwd = "", home = "", matchCase = false } = {}) {
  if (typeof commandText !== "string" || !commandText.trim()) return [];
  const opts = { matchCase };
  const out = /* @__PURE__ */ new Set();
  const quoted = [];
  const unquoted = commandText.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => {
    quoted.push(a ?? b);
    return "\0" + (quoted.length - 1) + "\0";
  });
  const rawTokens = unquoted.split(TOKEN_SPLIT).map((t) => t.trim()).filter(Boolean).map((t) => t.replace(/\u0000(\d+)\u0000/g, (_, n) => quoted[Number(n)] ?? ""));
  let anchor = cwd ? normalizeDir(cwd, opts) : "";
  for (let i = 0; i < rawTokens.length; i++) {
    let tok = rawTokens[i].replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "");
    if (!tok || tok.startsWith("-")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tok)) continue;
    if (/^(cd|pushd|chdir|set-location|sl)$/i.test(tok) && rawTokens[i + 1]) {
      const dest = resolveToken(rawTokens[i + 1], anchor, home, opts);
      if (dest) {
        anchor = dest;
        out.add(dest);
      }
      i++;
      continue;
    }
    const r = resolveToken(tok, anchor, home, opts);
    if (r) out.add(r);
  }
  return [...out];
}

// src/scan.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
var WALK_CAP = 5e3;
async function statPath(p) {
  try {
    const st = await fsp.stat(p);
    return { exists: true, isDir: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtimeMs };
  } catch {
    return { exists: false, isDir: false, isFile: false, size: 0, mtime: 0 };
  }
}
async function walkStats(dir, { maxFiles = WALK_CAP } = {}) {
  let files = 0;
  let bytes = 0;
  let truncated = false;
  const queue = [dir];
  while (queue.length) {
    const cur = queue.pop();
    let names;
    try {
      names = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const de of names) {
      const full = path.join(cur, de.name);
      if (de.isDirectory()) queue.push(full);
      else if (de.isFile()) {
        if (files >= maxFiles) {
          truncated = true;
          return { files, bytes, truncated };
        }
        files++;
        try {
          bytes += (await fsp.stat(full)).size;
        } catch {
        }
      }
    }
  }
  return { files, bytes, truncated };
}
async function rescanEntry(entry) {
  const st = await statPath(entry.path.replace(/\//g, path.sep === "\\" ? "\\" : "/") || entry.path);
  const out = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    exists: st.exists,
    isDir: st.isDir,
    isFile: st.isFile,
    files: 0,
    bytes: 0,
    truncated: false,
    watcherActive: false
  };
  if (st.exists && st.isDir && entry.recursive) {
    const native = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    const w = await walkStats(native.replace(/\//g, "\\"));
    out.files = w.files;
    out.bytes = w.bytes;
    out.truncated = w.truncated;
  }
  return out;
}
function startWatcher(nativePath, onEvent) {
  try {
    const watcher = fs.watch(nativePath, { recursive: true, persistent: false }, (event, filename) => {
      try {
        onEvent({ event, file: filename ? String(filename) : "" });
      } catch {
      }
    });
    watcher.on("error", () => {
    });
    return { stop: () => {
      try {
        watcher.close();
      } catch {
      }
    }, active: true };
  } catch {
    return { stop: () => {
    }, active: false };
  }
}

// src/ui.js
function renderUiHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>\u8DEF\u5F84\u9501\u5B9A\u7BB1 \xB7 Path Lockbox</title>
<style>
  :root {
    --lb-bg: var(--color-background-primary, #ffffff);
    --lb-bg2: var(--color-background-secondary, #f5f5f3);
    --lb-page: var(--color-background-tertiary, #efefec);
    --lb-fg: var(--color-text-primary, #1a1a1a);
    --lb-fg2: var(--color-text-secondary, #6b6b66);
    --lb-fg3: var(--color-text-tertiary, #9a9a94);
    --lb-border: var(--color-border-tertiary, rgba(0,0,0,.14));
    --lb-border2: var(--color-border-primary, rgba(0,0,0,.32));
    --lb-accent: var(--color-info, #378ADD);
    --lb-danger: var(--color-danger, #E24B4A);
    --lb-ok: var(--color-success, #639922);
    --lb-warn: var(--color-warning, #BA7517);
    --lb-radius: var(--border-radius-lg, 12px);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --lb-bg: var(--color-background-primary, #232322);
      --lb-bg2: var(--color-background-secondary, #2c2c2a);
      --lb-page: var(--color-background-tertiary, #191918);
      --lb-fg: var(--color-text-primary, #f0f0ee);
      --lb-fg2: var(--color-text-secondary, #a8a8a2);
      --lb-fg3: var(--color-text-tertiary, #7a7a74);
      --lb-border: var(--color-border-tertiary, rgba(255,255,255,.16));
      --lb-border2: var(--color-border-primary, rgba(255,255,255,.4));
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: var(--lb-page); color: var(--lb-fg);
         font: 13px/1.6 var(--font-sans, "Segoe UI", "Microsoft YaHei", sans-serif); }
  h1 { font-size: 15px; font-weight: 500; margin: 0; }
  .sub { color: var(--lb-fg2); margin-top: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          background: var(--lb-bg); border: 0.5px solid var(--lb-border);
          border-radius: var(--lb-radius); padding: 14px 18px; margin-bottom: 14px; }
  .counters { display: flex; gap: 18px; flex-shrink: 0; color: var(--lb-fg2); font-size: 12px; }
  .counters b { color: var(--lb-fg); font-weight: 500; font-size: 15px; display: block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
  .card { background: var(--lb-bg); border: 0.5px solid var(--lb-border);
          border-radius: var(--lb-radius); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.files { background: var(--lb-accent); }
  .dot.folders { background: var(--lb-ok); }
  .dot.drives { background: var(--lb-warn); }
  .card-title { font-weight: 500; }
  .count { margin-left: auto; color: var(--lb-fg3); font-size: 12px; }
  .entries { display: flex; flex-direction: column; gap: 6px; min-height: 64px; max-height: 260px;
             overflow: auto; }
  .empty { color: var(--lb-fg3); border: 1px dashed var(--lb-border); border-radius: 8px;
           padding: 14px; text-align: center; font-size: 12px; }
  .entry { display: flex; align-items: center; gap: 8px; padding: 7px 10px;
           border: 0.5px solid var(--lb-border); border-radius: 8px; cursor: pointer;
           font-family: var(--font-mono, Consolas, monospace); font-size: 12px; word-break: break-all; }
  .entry:hover { border-color: var(--lb-border2); }
  .entry.sel { border-color: var(--lb-accent); background: color-mix(in srgb, var(--lb-accent) 8%, transparent); }
  .badge { flex-shrink: 0; font-size: 11px; padding: 1px 7px; border-radius: 99px;
           border: 0.5px solid var(--lb-border); color: var(--lb-fg2); }
  .badge.on { color: var(--lb-ok); border-color: color-mix(in srgb, var(--lb-ok) 45%, transparent); }
  .badge.off { color: var(--lb-fg3); }
  .entry .rm { margin-left: auto; flex-shrink: 0; border: none; background: none; color: var(--lb-fg3);
               cursor: pointer; font-size: 14px; padding: 0 4px; border-radius: 4px; line-height: 1; }
  .entry .rm:hover { color: var(--lb-danger); background: color-mix(in srgb, var(--lb-danger) 10%, transparent); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { padding: 6px 12px; border: 0.5px solid var(--lb-border); background: var(--lb-bg2);
         color: var(--lb-fg); cursor: pointer; border-radius: 8px; font: inherit; }
  .btn:hover:not(:disabled) { border-color: var(--lb-accent); color: var(--lb-accent); }
  .btn:disabled { color: var(--lb-fg3); cursor: default; }
  .btn.primary { background: var(--lb-accent); border-color: var(--lb-accent); color: #fff; }
  .btn.danger:hover:not(:disabled) { border-color: var(--lb-danger); color: var(--lb-danger); }
  .settings { border-top: 0.5px solid var(--lb-border); padding-top: 10px; display: none; }
  .settings.show { display: block; }
  .settings .path { font-family: var(--font-mono, Consolas, monospace); font-size: 12px;
                    color: var(--lb-fg2); margin-bottom: 6px; word-break: break-all; }
  .chk { display: inline-flex; align-items: center; gap: 6px; margin-right: 18px; user-select: none;
         color: var(--lb-fg2); }
  .chk input { accent-color: var(--lb-accent); }
  .chk.dis { opacity: .45; }
  .stat { color: var(--lb-fg3); font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: none;
             align-items: center; justify-content: center; z-index: 50; }
  .overlay.show { display: flex; }
  .dialog { background: var(--lb-bg); border: 0.5px solid var(--lb-border2);
            border-radius: var(--lb-radius); width: 580px; max-width: 92vw; max-height: 82vh;
            display: flex; flex-direction: column; padding: 16px; color: var(--lb-fg); }
  .dialog h3 { margin: 0 0 8px; font-size: 14px; font-weight: 500; }
  .crumb { font-size: 12px; color: var(--lb-fg2); margin-bottom: 8px; word-break: break-all; }
  .picklist { height: 300px; overflow: auto; border: 0.5px solid var(--lb-border); border-radius: 8px; }
  .picklist div { padding: 5px 10px; cursor: pointer; font-family: var(--font-mono, Consolas, monospace); font-size: 12px; }
  .picklist div.dir { color: var(--lb-fg); }
  .picklist div.dir::before { content: "\u25B8 "; color: var(--lb-warn); }
  .picklist div.file::before { content: "\xB7 "; color: var(--lb-fg3); }
  .picklist div.drive::before { content: "\u26C1 "; color: var(--lb-accent); }
  .picklist div.sel { background: var(--lb-accent); color: #fff; }
  .dlgbtns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  input.txt { width: 100%; padding: 7px 10px; border: 0.5px solid var(--lb-border2);
              border-radius: 8px; font: 13px var(--font-mono, Consolas, monospace);
              background: var(--lb-bg2); color: var(--lb-fg); }
  .hint { color: var(--lb-danger); font-size: 12px; min-height: 16px; margin-top: 4px; }
  .note { color: var(--lb-fg3); font-size: 12px; margin-top: 4px; }
</style>
</head>
<body>
<div class="head">
  <div>
    <h1>\u8DEF\u5F84\u9501\u5B9A\u7BB1</h1>
    <div class="sub">\u9501\u5B9A\u7684\u8DEF\u5F84\u5BF9\u6240\u6709\u5DE5\u5177\u8C03\u7528\u4E00\u5F8B\u62D2\u7EDD\u2014\u2014\u5305\u62EC\u5B8C\u5168\u8BBF\u95EE\u6A21\u5F0F\u3002\u5361\u7247\u6309 \u6587\u4EF6 / \u6587\u4EF6\u5939 / \u786C\u76D8 \u5206\u7C7B\u3002</div>
  </div>
  <div class="counters">
    <div><b id="cRules">-</b>\u89C4\u5219</div>
    <div><b id="cWatch">-</b>\u76D1\u63A7\u4E2D</div>
    <div><b id="cEvents">-</b>\u76D1\u63A7\u4E8B\u4EF6</div>
  </div>
</div>

<div class="grid">
  <div class="card" data-kind="files">
    <div class="card-head"><span class="dot files"></span><span class="card-title">\u6587\u4EF6</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk dis"><input type="checkbox" data-chk-recursive disabled>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk dis"><input type="checkbox" data-chk-watch disabled>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="folders">
    <div class="card-head"><span class="dot folders"></span><span class="card-title">\u6587\u4EF6\u5939</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk"><input type="checkbox" data-chk-watch>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="drives">
    <div class="card-head"><span class="dot drives"></span><span class="card-title">\u786C\u76D8</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk"><input type="checkbox" data-chk-watch>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>
</div>

<div class="overlay" id="pickOverlay">
  <div class="dialog">
    <h3 id="pickTitle">\u9009\u62E9\u8DEF\u5F84</h3>
    <div class="crumb" id="crumb"></div>
    <div class="picklist" id="pickList"></div>
    <div class="dlgbtns">
      <button class="btn" id="pickUp">\u4E0A\u4E00\u7EA7</button>
      <button class="btn primary" id="pickOk">\u786E\u5B9A</button>
      <button class="btn" id="pickCancel">\u53D6\u6D88</button>
    </div>
  </div>
</div>

<div class="overlay" id="customOverlay">
  <div class="dialog" style="width:480px">
    <h3 id="customTitle">\u6DFB\u52A0\u81EA\u5B9A\u4E49</h3>
    <div class="sub" id="customHint"></div>
    <input class="txt" id="customInput" spellcheck="false">
    <div class="hint" id="customErr"></div>
    <div class="dlgbtns">
      <button class="btn primary" id="customOk">\u786E\u5B9A</button>
      <button class="btn" id="customCancel">\u53D6\u6D88</button>
    </div>
  </div>
</div>

<script>
(() => {
  const KINDS = {
    files:   { leaf: true,  pickTitle: "\u9009\u62E9\u6587\u4EF6",  customHint: "\u8F93\u5165\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\docs\\\\a.txt \u6216 ~/secrets.env\u3002" },
    folders: { leaf: false, pickTitle: "\u9009\u62E9\u6587\u4EF6\u5939", customHint: "\u8F93\u5165\u6587\u4EF6\u5939\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\docs \u6216 ~/work\u3002" },
    drives:  { leaf: false, pickTitle: "\u9009\u62E9\u786C\u76D8",  customHint: "\u8F93\u5165\u76D8\u7B26\uFF0C\u5982 E: / E:\\\\ / E:/\u3002" },
  };
  const state = { files: [], folders: [], drives: [] };
  let stats = {};
  const sel = { files: -1, folders: -1, drives: -1 };
  let pick = { path: "", selPath: "", kind: "" };

  const $ = (id) => document.getElementById(id);
  const q = (root, sel2) => root.querySelector(sel2);
  const qa = (root, sel2) => [...root.querySelectorAll(sel2)];
  const card = (kind) => document.querySelector('.card[data-kind="' + kind + '"]');

  async function api(path, opts) {
    const r = await fetch("/path-lockbox/api/" + path, opts);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function renderCard(kind) {
    const k = KINDS[kind];
    const c = card(kind);
    const arr = state[kind];
    q(c, "[data-count]").textContent = arr.length + " \u6761";
    const box = q(c, "[data-list]");
    box.innerHTML = "";
    if (!arr.length) {
      box.innerHTML = '<div class="empty">\u6682\u65E0\u6761\u76EE\uFF0C\u70B9\u300C\u6DFB\u52A0\u2026\u300D\u6216\u300C\u6DFB\u52A0\u81EA\u5B9A\u4E49\u300D</div>';
    }
    arr.forEach((e, i) => {
      const div = document.createElement("div");
      div.className = "entry" + (i === sel[kind] ? " sel" : "");
      const badge = k.leaf ? "" :
        '<span class="badge ' + (e.recursive ? "on" : "off") + '">' + (e.recursive ? "\u542B\u5B50\u9879" : "\u4EC5\u672C\u5C42") + "</span>" +
        '<span class="badge ' + (e.watch ? "on" : "off") + '">' + (e.watch ? "\u76D1\u63A7\u4E2D" : "\u672A\u76D1\u63A7") + "</span>";
      div.innerHTML = "<span>" + esc(e.path) + "</span>" + badge +
        '<button class="rm" title="\u79FB\u9664">\u2715</button>';
      div.onclick = (ev) => {
        if (ev.target.classList.contains("rm")) return;
        sel[kind] = i; renderAll();
      };
      q(div, ".rm").onclick = async () => {
        arr.splice(i, 1); sel[kind] = -1; await save(); renderAll();
      };
      box.appendChild(div);
    });
    renderSettings(kind);
  }

  function renderSettings(kind) {
    const k = KINDS[kind];
    const c = card(kind);
    const e = state[kind][sel[kind]];
    const s = q(c, "[data-settings]");
    s.classList.toggle("show", !!e);
    if (!e) return;
    q(c, "[data-setpath]").textContent = e.path;
    const rChk = q(c, "[data-chk-recursive]");
    const wChk = q(c, "[data-chk-watch]");
    rChk.disabled = k.leaf; wChk.disabled = false;
    rChk.parentElement.classList.toggle("dis", k.leaf);
    rChk.checked = !!e.recursive; wChk.checked = !!e.watch;
    q(c, "[data-note]").textContent = k.leaf ? "\u6587\u4EF6\u662F\u53F6\u5B50\u8282\u70B9\uFF0C\u6CA1\u6709\u5B50\u9879\u53EF\u7D22\u5F15\u3002" : "";
    const st = stats[e.path];
    q(c, "[data-stat]").textContent = st
      ? "\u91CD\u626B\u63CF " + st.at + "\uFF1A\u5B58\u5728=" + (st.exists ? "\u662F" : "\u5426") +
        (st.files ? "\uFF0C" + st.files + " \u4E2A\u6587\u4EF6 / " + (st.bytes / 1048576).toFixed(1) + " MB" : "") +
        (st.truncated ? "\uFF08\u5DF2\u8FBE\u679A\u4E3E\u4E0A\u9650\uFF09" : "") +
        "\uFF0C\u76D1\u63A7=" + (st.watcherActive ? "\u6D3B\u52A8\u4E2D" : "\u672A\u542F\u7528/\u4E0D\u53EF\u7528")
      : "\u5C1A\u672A\u91CD\u626B\u63CF\u3002";
  }

  function renderHead() {
    const total = state.files.length + state.folders.length + state.drives.length;
    $("cRules").textContent = total;
    const watching = [...state.folders, ...state.drives].filter(e => e.watch).length;
    $("cWatch").textContent = watching;
    $("cEvents").textContent = window.__evCount ?? "-";
  }

  function renderAll() { for (const k of Object.keys(KINDS)) renderCard(k); renderHead(); }

  async function save() {
    await api("config", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(state) });
  }

  async function reload() {
    const d = await api("config");
    for (const k of Object.keys(KINDS)) state[k] = d.config[k] ?? [];
    stats = d.stats || {};
    window.__evCount = (d.events || []).length;
    for (const k of Object.keys(sel)) if (sel[k] >= state[k].length) sel[k] = state[k].length - 1;
    renderAll();
  }

  // ---- \u8BBE\u7F6E\u52FE\u9009 ----
  for (const kind of Object.keys(KINDS)) {
    const c = card(kind);
    q(c, "[data-chk-recursive]").addEventListener("change", async (ev) => {
      const e = state[kind][sel[kind]]; if (!e) return;
      e.recursive = ev.target.checked; await save(); renderAll();
    });
    q(c, "[data-chk-watch]").addEventListener("change", async (ev) => {
      const e = state[kind][sel[kind]]; if (!e) return;
      e.watch = ev.target.checked; await save(); await reload();
    });
    q(c, "[data-rescan]").onclick = async () => {
      const e = state[kind][sel[kind]];
      if (!e) { q(c, "[data-stat]").textContent = "\u5148\u9009\u62E9\u4E00\u4E2A\u6761\u76EE\u3002"; return; }
      q(c, "[data-stat]").textContent = "\u91CD\u626B\u63CF\u4E2D\u2026";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: e.path }) });
      stats = d.stats || stats; renderSettings(kind);
    };
    q(c, "[data-rescan-all]").onclick = async () => {
      q(c, "[data-stat]").textContent = "\u91CD\u626B\u63CF\u5168\u90E8\u4E2D\u2026";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }) });
      stats = d.stats || stats; renderAll();
    };
  }

  // ---- \u6D4F\u89C8\u9009\u62E9 ----
  async function openPicker(kind) {
    pick.kind = kind; pick.selPath = "";
    $("pickTitle").textContent = KINDS[kind].pickTitle;
    $("pickOverlay").classList.add("show");
    await browse(kind === "drives" ? "" : "/");
  }

  async function browse(path) {
    const d = await api("browse" + (path ? "?path=" + encodeURIComponent(path) : ""));
    pick.path = d.path;
    $("crumb").textContent = d.path || "\u6B64\u7535\u8111";
    const pl = $("pickList"); pl.innerHTML = "";
    for (const en of d.entries || []) {
      if (pick.kind === "folders" && !en.isDir) continue;
      if (pick.kind === "drives" && !en.isDrive) continue;
      const div = document.createElement("div");
      div.className = en.isDrive ? "drive" : en.isDir ? "dir" : "file";
      div.textContent = en.name;
      div.onclick = () => {
        qa(pl, ".sel").forEach(x => x.classList.remove("sel"));
        div.classList.add("sel");
        pick.selPath = en.path;
      };
      div.ondblclick = async () => {
        if (en.isDir) await browse(en.path);
        else if (pick.kind === "files") { pick.selPath = en.path; $("pickOk").click(); }
      };
      pl.appendChild(div);
    }
  }

  $("pickUp").onclick = async () => {
    if (pick.kind === "drives") return;
    const d = await api("browse?path=" + encodeURIComponent(pick.path || "/"));
    await browse(d.parent || "/");
  };
  $("pickOk").onclick = async () => {
    if (!pick.selPath) return;
    const k = pick.kind;
    if (k === "drives") state.drives.push({ path: pick.selPath, recursive: true, watch: false });
    else if (k === "folders") state.folders.push({ path: pick.selPath, recursive: true, watch: false });
    else state.files.push({ path: pick.selPath });
    $("pickOverlay").classList.remove("show");
    sel[k] = state[k].length - 1;
    await save(); await reload();
  };
  $("pickCancel").onclick = () => $("pickOverlay").classList.remove("show");

  for (const kind of Object.keys(KINDS)) {
    card(kind).querySelector("[data-add]").onclick = () => openPicker(kind);
  }

  // ---- \u81EA\u5B9A\u4E49\u6DFB\u52A0 ----
  let customKind = "";
  for (const kind of Object.keys(KINDS)) {
    card(kind).querySelector("[data-custom]").onclick = () => {
      customKind = kind;
      $("customErr").textContent = ""; $("customInput").value = "";
      $("customHint").textContent = KINDS[kind].customHint;
      $("customOverlay").classList.add("show");
      $("customInput").focus();
    };
  }
  $("customOk").onclick = async () => {
    const raw = $("customInput").value.trim();
    const arr = state[customKind];
    let path = raw;
    if (customKind === "drives") {
      const m = /^([a-zA-Z]):[\\\\\\/]?/.exec(raw);
      if (!m) { $("customErr").textContent = "\u786C\u76D8\u7C7B\u522B\u8BF7\u586B\u76D8\u7B26\uFF0C\u5982 E: / E:\\\\ / E:/"; return; }
      path = m[1] + ":/";
    } else if (!/^([a-zA-Z]:[\\\\\\/]|\\/|~)/.test(raw)) {
      $("customErr").textContent = "\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 D:\\\\docs \u6216 ~/secrets.env\uFF09";
      return;
    }
    if (arr.some(e => e.path.toLowerCase() === path.toLowerCase())) {
      $("customErr").textContent = "\u8BE5\u8DEF\u5F84\u5DF2\u5728\u5217\u8868\u4E2D"; return;
    }
    if (customKind === "drives") arr.push({ path, recursive: true, watch: false });
    else if (customKind === "folders") arr.push({ path, recursive: true, watch: false });
    else arr.push({ path });
    $("customOverlay").classList.remove("show");
    sel[customKind] = arr.length - 1;
    await save(); await reload();
  };
  $("customCancel").onclick = () => $("customOverlay").classList.remove("show");

  setInterval(async () => {
    try { const d = await api("events"); window.__evCount = (d.events || []).length; renderHead(); } catch {}
  }, 5000);

  reload();
})();
</script>
</body>
</html>`;
}

// src/index.js
var name = "path-lockbox";
var PathEntry = Schema.object({
  path: Schema.string(),
  label: Schema.string().default(""),
  recursive: Schema.boolean().default(true),
  watch: Schema.boolean().default(false)
});
var Config = Schema.object({
  files: Schema.array(PathEntry).default([]),
  folders: Schema.array(PathEntry).default([]),
  drives: Schema.array(PathEntry).default([]),
  matchCase: Schema.boolean().default(false).description("\u8DEF\u5F84\u6BD4\u8F83\u662F\u5426\u533A\u5206\u5927\u5C0F\u5199\uFF08\u9ED8\u8BA4\u4E0D\u533A\u5206\uFF09"),
  guidance: Schema.boolean().default(true).description("\u62D2\u7EDD\u65F6\u662F\u5426\u9644\u5E26\u4FEE\u590D\u6307\u5F15"),
  extraPathArgs: Schema.dict(Schema.array(Schema.string())).default({}),
  extraCommandArgs: Schema.dict(Schema.string()).default({})
});
var inject = ["webServer", "tools"];
var SHELL_TOOLS = /* @__PURE__ */ new Set(["bash", "pwsh", "shell", "powershell"]);
var PATH_ARGS_DEFAULT = ["file_path", "path", "target", "notebook_path"];
function log(ctx, msg) {
  try {
    ctx.logger?.info?.(`[path-lockbox] ${msg}`);
  } catch {
  }
}
function storeFile() {
  const base = process.env.DSH_HOME || path2.join(os.homedir(), ".dsh");
  return path2.join(base, "path-lockbox.json");
}
function loadStore(file) {
  try {
    const raw = JSON.parse(fs2.readFileSync(file, "utf8"));
    if (raw && typeof raw === "object") return raw;
  } catch {
  }
  return null;
}
function saveStore(file, data) {
  fs2.mkdirSync(path2.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs2.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs2.renameSync(tmp, file);
}
function asList(v) {
  return Array.isArray(v) ? v : [];
}
function coerceEntry(kind, raw, matchCase) {
  const rawPath = typeof raw === "string" ? raw : raw?.path;
  const abs = normalizePath(expandTilde(String(rawPath ?? ""), os.homedir()), { matchCase });
  if (!abs || !/^[a-z]:\//.test(abs) && !abs.startsWith("/")) return null;
  if (kind === "drives" && !/^[a-z]:\/$/.test(abs)) return null;
  return {
    path: abs,
    label: String(rawPath ?? abs),
    recursive: raw?.recursive !== false,
    watch: !!raw?.watch
  };
}
function apply(ctx, config = {}) {
  const store = storeFile();
  const readConfig = () => {
    const raw = typeof config?.get === "function" ? config.get() : config;
    return raw ?? {};
  };
  const cfg = () => readConfig();
  const matchCase = () => cfg().matchCase === true;
  const guidance = () => cfg().guidance !== false;
  const runtime = {
    entries: [],
    matcher: null,
    stats: {},
    // entryPath -> rescan 统计
    events: [],
    // 监控事件环形缓冲
    watchers: /* @__PURE__ */ new Map()
    // entryPath -> { stop, active }
  };
  const selfProtectedPath = () => normalizePath(store, { matchCase: false });
  function effectiveLists() {
    const s = loadStore(store);
    return {
      files: asList(s?.files ?? cfg().files),
      folders: asList(s?.folders ?? cfg().folders),
      drives: asList(s?.drives ?? cfg().drives)
    };
  }
  function rebuild() {
    const lists = effectiveLists();
    const mc = matchCase();
    const built = buildEntries(
      {
        files: lists.files,
        folders: lists.folders,
        drives: lists.drives
      },
      { matchCase: mc }
    );
    built.entries.push({ kind: "file", path: selfProtectedPath(), label: store, recursive: false, watch: false });
    runtime.entries = built.entries;
    runtime.matcher = makeMatcher(built.entries, { matchCase: mc });
    for (const w of built.warnings) log(ctx, w);
    syncWatchers();
    log(ctx, `\u5DF2\u52A0\u8F7D ${built.entries.length - 1} \u6761\u7528\u6237\u89C4\u5219 + 1 \u6761\u81EA\u4FDD\u62A4\uFF08${store}\uFF09`);
  }
  function syncWatchers() {
    const want = /* @__PURE__ */ new Map();
    for (const e of runtime.entries) {
      if (e.watch && (e.kind === "folder" || e.kind === "drive")) {
        want.set(e.path, e);
      }
    }
    for (const [p, w] of runtime.watchers) {
      if (!want.has(p)) {
        w.stop();
        runtime.watchers.delete(p);
      }
    }
    for (const [p, e] of want) {
      if (runtime.watchers.has(p)) continue;
      const native = e.path.endsWith("/") ? e.path.slice(0, -1) : e.path;
      const w = startWatcher(native.replace(/\//g, path2.sep), (ev) => {
        runtime.events.push({ ts: (/* @__PURE__ */ new Date()).toISOString(), path: e.path, event: ev.event, file: ev.file });
        if (runtime.events.length > 200) runtime.events.splice(0, runtime.events.length - 200);
      });
      runtime.watchers.set(p, w);
      runtime.stats[p] = { ...runtime.stats[p] ?? {}, watcherActive: w.active };
    }
  }
  function denyReason(entry, display) {
    return `Access to "${display ?? entry.label}" is blocked by path-lockbox policy (rule "${entry.label}", kind=${entry.kind}).` + (guidance() ? " \u8FD9\u662F\u90E8\u7F72\u7B56\u7565\u800C\u975E\u6545\u969C\uFF1B\u8BF7\u4E0D\u8981\u5C1D\u8BD5\u7ED5\u8FC7\u6216\u91CD\u8BD5\u8BE5\u8DEF\u5F84\u3002" : "");
  }
  function argsOf(exec) {
    return exec?.args ?? exec?.input ?? exec?.params ?? {};
  }
  function nameOf(exec) {
    return String(exec?.name ?? exec?.tool ?? "");
  }
  function inspectExecution(exec) {
    if (!runtime.matcher) return null;
    const args = argsOf(exec);
    const tool = nameOf(exec);
    const workdirRaw = args.workdir ?? args.cwd ?? "";
    const workdir = workdirRaw ? normalizePath(String(workdirRaw), { matchCase: matchCase() }) : "";
    const anchor = workdir || normalizePath(process.cwd(), { matchCase: matchCase() });
    const home = os.homedir();
    const checkPathValue = (v) => {
      if (typeof v !== "string" || !v.trim()) return null;
      let t = expandTilde(v, home);
      if (!/^[a-zA-Z]:[\\/]/.test(t) && !t.startsWith("/") && anchor) {
        t = anchor.replace(/\/$/, "") + "/" + t.replace(/^[.]\//, "");
      }
      return runtime.matcher.match(t);
    };
    const commandArgNames = /* @__PURE__ */ new Set(
      ["command", "cmd", "script", ...Object.entries(cfg().extraCommandArgs ?? {}).filter(([, v]) => tool === v || v === tool).map(([k]) => k)]
    );
    const isShell = SHELL_TOOLS.has(tool) || [...cfg().extraCommandArgs ? Object.keys(cfg().extraCommandArgs) : []].includes(tool);
    if (isShell) {
      if (workdir) {
        const hit = runtime.matcher.match(workdir);
        if (hit) return hit;
      }
      const cmd = args.command ?? args.cmd ?? args.script ?? "";
      if (typeof cmd === "string" && cmd.trim()) {
        for (const cand of extractPathsFromCommand(cmd, { cwd: anchor, home, matchCase: matchCase() })) {
          const hit = runtime.matcher.match(cand);
          if (hit) return hit;
        }
        const textHit = runtime.matcher.matchCommandText(cmd);
        if (textHit) return textHit;
      }
      return null;
    }
    const pathArgs = [...PATH_ARGS_DEFAULT, ...cfg().extraPathArgs?.[tool] ?? []];
    for (const key of pathArgs) {
      const hit = checkPathValue(args[key]);
      if (hit) return hit;
    }
    for (const v of Object.values(args)) {
      if (typeof v === "string" && commandArgNames.has(Object.keys(args).find((k) => args[k] === v) ?? "")) continue;
      if (typeof v === "string" && /^[a-zA-Z]:[\\/]|^\//.test(v)) {
        const hit = checkPathValue(v);
        if (hit) return hit;
      }
    }
    return null;
  }
  try {
    const dispose = ctx.tools?.guard?.((exec) => {
      const hit = inspectExecution(exec);
      return hit ? denyReason(hit) : void 0;
    });
    if (typeof dispose === "function") {
      ctx.effect?.(() => {
        try {
          dispose();
        } catch {
        }
      });
    }
    log(ctx, "guard \u5B88\u536B\u5DF2\u6CE8\u518C\uFF08\u5355\u8C03\u62D2\u7EDD\u5C42\u751F\u6548\uFF09");
  } catch (e) {
    log(ctx, `guard \u4E0D\u53EF\u7528\uFF0C\u4EC5 pre-execute \u5C42\u751F\u6548\uFF1A${e?.message ?? e}`);
  }
  ctx.on?.("tools/pre-execute", async (exec, next) => {
    try {
      const hit = inspectExecution(exec);
      if (hit) return { kind: "deny", reason: denyReason(hit) };
    } catch (e) {
      log(ctx, `pre-execute \u68C0\u67E5\u5F02\u5E38\uFF0C\u653E\u884C\uFF1A${e?.message ?? e}`);
    }
    return next?.();
  });
  ctx.on?.("tools/post-execute", async (exec, result, next) => {
    try {
      return next?.(filterResult(result));
    } catch {
      return next?.(result);
    }
  });
  function filterResult(result) {
    if (!result || typeof result !== "object") return result;
    const clone2 = { ...result };
    if (Array.isArray(clone2.matches)) {
      clone2.matches = clone2.matches.filter((m) => !runtime.matcher?.match(m?.path ?? ""));
    }
    if (Array.isArray(clone2.paths)) {
      clone2.paths = clone2.paths.filter((p) => !runtime.matcher?.match(typeof p === "string" ? p : p?.path ?? ""));
    }
    for (const k of ["stdout", "stderr"]) {
      const t = clone2[k];
      if (t && typeof t === "object" && typeof t.text === "string") {
        clone2[k] = { ...t, text: stripBlockedLines(t.text) };
      }
    }
    if (typeof clone2.text === "string") clone2.text = stripBlockedLines(clone2.text);
    return clone2;
  }
  function stripBlockedLines(text) {
    if (!runtime.entries.length) return text;
    return text.split("\n").filter((line) => !runtime.entries.some((e) => lineHits(e, line))).join("\n");
  }
  function lineHits(entry, line) {
    const l = matchCase() ? line : line.toLowerCase();
    if (entry.kind === "drive") return l.includes(entry.path);
    if (entry.kind === "file") return l.includes(entry.path);
    if (entry.kind === "folder") {
      if (!entry.recursive) return l.includes(entry.path);
      return l.includes(entry.path) && (l.includes(entry.path + "/") || l.trim() === entry.path);
    }
    return false;
  }
  async function doRescan(targetPath) {
    const targets = targetPath ? runtime.entries.filter((e) => e.path === normalizePath(targetPath, { matchCase: matchCase() })) : runtime.entries;
    for (const e of targets) {
      try {
        const s = await rescanEntry(e);
        s.watcherActive = runtime.watchers.get(e.path)?.active ?? false;
        runtime.stats[e.path] = s;
      } catch (err) {
        runtime.stats[e.path] = { at: (/* @__PURE__ */ new Date()).toISOString(), error: String(err?.message ?? err) };
      }
    }
    return runtime.stats;
  }
  try {
    const register = ctx.tools?.register;
    if (typeof register === "function") {
      register({
        name: "lockbox_status",
        description: "\u5217\u51FA\u8DEF\u5F84\u9501\u5B9A\u7BB1\u5F53\u524D\u89C4\u5219\u3001\u91CD\u626B\u63CF\u7EDF\u8BA1\u4E0E\u6700\u8FD1\u76D1\u63A7\u4E8B\u4EF6\uFF08\u53EA\u8BFB\uFF0C\u4E0D\u53EF\u4FEE\u6539\uFF09\u3002",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          const lists = effectiveLists();
          return JSON.stringify(
            { rules: lists, stats: runtime.stats, recentEvents: runtime.events.slice(-20) },
            null,
            2
          );
        }
      });
    }
  } catch (e) {
    log(ctx, `lockbox_status \u6CE8\u518C\u5931\u8D25\uFF08\u5FFD\u7565\uFF09\uFF1A${e?.message ?? e}`);
  }
  const routePumps = /* @__PURE__ */ new Map();
  const routeDisposers = [];
  function nodeToWebRequest(nodeReq, bodyBuf) {
    const proto = nodeReq?.socket?.encrypted ? "https" : "http";
    const host = nodeReq?.headers?.host ?? "127.0.0.1";
    const method = String(nodeReq?.method ?? "GET").toUpperCase();
    const headers = new Headers();
    for (const [key, value] of Object.entries(nodeReq?.headers ?? {})) {
      if (value === void 0 || value === null) continue;
      if (Array.isArray(value)) for (const item of value) headers.append(key, String(item));
      else headers.set(key, String(value));
    }
    const init = { method, headers };
    if (bodyBuf?.length && method !== "GET" && method !== "HEAD") init.body = bodyBuf;
    return new Request(new URL(nodeReq?.url ?? "/", proto + "://" + host), init);
  }
  async function sendWebResponse(nodeRes, response) {
    const status = Number(response?.status ?? 200);
    const headers = {};
    try {
      response?.headers?.forEach?.((value, key) => {
        headers[key] = value;
      });
    } catch {
    }
    try {
      nodeRes.writeHead(status, headers);
    } catch {
      try {
        nodeRes.statusCode = status;
      } catch {
      }
    }
    let body = Buffer.alloc(0);
    try {
      body = Buffer.from(await response.arrayBuffer());
    } catch {
    }
    nodeRes.end(body);
  }
  function mountRoute(method, url, handler) {
    const ws = ctx.webServer;
    if (!ws) return false;
    const upper = String(method).toUpperCase();
    if (typeof ws.register !== "function") {
      const legacy = [
        () => ws.route?.(method, url, handler),
        () => ws.route?.({ method, path: url, handler }),
        () => upper === "GET" ? ws.get?.(url, handler) : ws.post?.(url, handler)
      ];
      for (const attempt of legacy) {
        try {
          const r = attempt();
          if (r !== false && r !== void 0) return true;
        } catch {
        }
      }
      return false;
    }
    let pump = routePumps.get(url);
    if (pump) {
      pump.methods.set(upper, handler);
      return true;
    }
    const methods = /* @__PURE__ */ new Map([[upper, handler]]);
    const nodeHandler = async (nodeReq, nodeRes) => {
      const m = String(nodeReq?.method ?? "GET").toUpperCase();
      const fn = methods.get(m) ?? (m === "HEAD" ? methods.get("GET") : void 0);
      if (!fn) {
        const allow = Array.from(methods.keys()).join(", ");
        try {
          nodeRes.writeHead(405, { allow });
        } catch {
          try {
            nodeRes.statusCode = 405;
          } catch {
          }
        }
        nodeRes.end();
        return;
      }
      let bodyBuf;
      if (m !== "GET" && m !== "HEAD") {
        const chunks = [];
        try {
          for await (const chunk of nodeReq) chunks.push(chunk);
        } catch {
        }
        bodyBuf = Buffer.concat(chunks);
      }
      try {
        const response = await fn(nodeToWebRequest(nodeReq, bodyBuf));
        await sendWebResponse(nodeRes, response);
      } catch (e) {
        try {
          nodeRes.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        } catch {
          try {
            nodeRes.statusCode = 500;
          } catch {
          }
        }
        nodeRes.end(String(e?.message ?? e));
      }
    };
    let dispose;
    try {
      dispose = ws.register({ kind: "exact", path: url, handler: nodeHandler });
    } catch (e) {
      log(ctx, "\u8DEF\u7531\u6CE8\u518C\u5931\u8D25 " + url + "\uFF1A" + (e?.message ?? e));
      return false;
    }
    routePumps.set(url, { methods, dispose });
    if (typeof dispose === "function") routeDisposers.push(dispose);
    return true;
  }
  ctx.effect?.(() => () => {
    for (const dispose of routeDisposers.splice(0)) {
      try {
        dispose();
      } catch {
      }
    }
    routePumps.clear();
  });
  async function readBody(req) {
    try {
      if (typeof req?.json === "function") return await req.json();
    } catch {
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return {};
    }
  }
  function fenced(handler) {
    return async (req, ...rest) => {
      try {
        await ctx.get("connection")?.requestRejection?.(req);
      } catch (e) {
        return new Response("forbidden", { status: 403 });
      }
      return handler(req, ...rest);
    };
  }
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  const mounted = mountRoute("GET", "/path-lockbox/ui", fenced(async () => new Response(renderUiHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }))) && mountRoute("GET", "/path-lockbox/api/config", fenced(async () => json({ config: effectiveLists(), stats: runtime.stats, events: runtime.events }))) && mountRoute("POST", "/path-lockbox/api/config", fenced(async (req) => {
    const body = await readBody(req);
    const mc = matchCase();
    const data = { version: 1, files: [], folders: [], drives: [] };
    for (const kind of ["files", "folders", "drives"]) {
      for (const raw of asList(body?.[kind])) {
        const e = coerceEntry(kind, raw, mc);
        if (e) data[kind].push(e);
      }
    }
    saveStore(store, data);
    rebuild();
    return json({ ok: true });
  })) && mountRoute("GET", "/path-lockbox/api/browse", fenced(async (req) => {
    const url = new URL(req?.url ?? "http://x/", "http://x");
    const target = url.searchParams.get("path") ?? "";
    const mc = matchCase();
    const native = (target ? expandTilde(target, os.homedir()) : "").replace(/\//g, path2.sep);
    const result = { path: normalizePath(target, { matchCase: mc }), parent: "", entries: [] };
    if (!native || native === path2.sep || /^[a-zA-Z]:\\?$/.test(native)) {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c) + ":\\";
        try {
          if (fs2.existsSync(letter)) {
            drives.push({ name: letter, path: letter, isDir: true, isFile: false, isDrive: true });
          }
        } catch {
        }
      }
      result.entries = drives;
      result.path = result.path || "";
      return json(result);
    }
    const parent = path2.dirname(native);
    result.parent = normalizePath(parent, { matchCase: mc });
    let names = [];
    try {
      names = fs2.readdirSync(native, { withFileTypes: true });
    } catch {
      return json({ error: "cannot list" }, 400);
    }
    names.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    result.entries = names.slice(0, 2e3).map((de) => ({
      name: de.name,
      path: normalizePath(path2.join(native, de.name), { matchCase: mc }),
      isDir: de.isDirectory(),
      isFile: de.isFile(),
      isDrive: false
    }));
    return json(result);
  })) && mountRoute("POST", "/path-lockbox/api/rescan", fenced(async (req) => {
    const body = await readBody(req);
    const stats = await doRescan(body?.all ? null : body?.path);
    return json({ ok: true, stats });
  })) && mountRoute("GET", "/path-lockbox/api/events", fenced(async () => json({ events: runtime.events })));
  log(ctx, mounted ? "UI \u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1A/path-lockbox/ui" : "webServer/connection \u7F3A\u5E2D\u6216\u8DEF\u7531 API \u4E0D\u5339\u914D\uFF0CUI \u4E0D\u53EF\u7528\uFF08\u62E6\u622A\u5C42\u4E0D\u53D7\u5F71\u54CD\uFF09");
  rebuild();
  ctx.effect?.(() => {
    for (const [, w] of runtime.watchers) w.stop();
    runtime.watchers.clear();
  });
}
export {
  Config,
  apply,
  inject,
  name
};
