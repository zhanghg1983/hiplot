/*
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as d3 from "d3";


const special_numerics = ['inf', '-inf', Infinity, -Infinity, null, '', 'NaN'];
export function is_special_numeric(x) {
    return special_numerics.indexOf(x) >= 0 || Number.isNaN(x);
};


interface d3ScalePercentile {
    (x: any): any;
    domain_idx: any;
    range: any;
    invert: any,
    copy: any,
    tickFormat: any,
    ticks: any,
};

function toPrecisionFloor(v: number, p: number): number {
    if (v < 0) {
        return -toPrecisionFloor(-v, p);
    } else if (v == 0) {
        return 0;
    }
    var pow = 10 ** (p - 1 - Math.floor(Math.log10(v)));
    return Math.floor(v * pow) / pow;
}

export function convert_to_categorical_input(v: any): any {
    if (v === "") {
        return "(empty)";
    }
    return "" + v;
}

export function d3_scale_categorical(distinct_values: Array<any>): d3.ScalePoint<any> {
    const valuesSet = new Set();
    for (var idx = 0; idx < distinct_values.length; ++idx) {
        valuesSet.add(convert_to_categorical_input(distinct_values[idx]));
    }
    distinct_values = Array.from(valuesSet);
    distinct_values.sort();
    const scale = d3.scalePoint().domain(distinct_values);

    function scale_fn(x: any): number {
        return scale(convert_to_categorical_input(x));
    }
    Object.assign(scale_fn, {
        'copy': scale.copy,
        'range': scale.range,
        'rangeRound': scale.rangeRound,
        'round': scale.round,
        'domain': scale.domain,
    });
    // @ts-ignore
    return scale_fn;
}

export function get_numeric_values_sorted(values: Array<any>): Array<number> {
    values = values.map(x => parseFloat(x)).filter(x => Number.isFinite(x));
    values = Array.from(new Set(values));
    values.sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
    return values;
}

export function d3_scale_percentile(values: Array<any>): d3ScalePercentile {
    /**
     * Creates a quantile scale for d3js.
     * maps a point to its quantile (from 0 to 1)
     * .. and handles ticks correctly (unlike d3.scaleQuantile)
     */
    return d3_scale_percentile_values_sorted(get_numeric_values_sorted(values));
}

export function d3_scale_percentile_values_sorted(values: Array<number>): d3ScalePercentile {
    console.assert(values.length >= 2);
    var domain_idx = [0, values.length - 1];
    var scaleOutput = d3.scaleLinear().domain([0, 1]);
    var scale: any = function(x: number): number {
        if (x == Infinity || x == -Infinity || isNaN(x)) {
            return scaleOutput(-1);
        }
        if (x > values[domain_idx[domain_idx.length - 1]]) {
            return scaleOutput(1.0);
        } else if (x < values[domain_idx[0]]) {
            return scaleOutput(0.0);
        }
        const upper = d3.bisectLeft(values, x, domain_idx[0], domain_idx[1]);
        var pctile = (upper - domain_idx[0]) / (domain_idx[1] - domain_idx[0]);
        if (values[upper] !== x && upper > domain_idx[0]) {
            // For example when rendering axis ticks
            const lower = upper - 1;
            const lowerV = values[lower];
            const upperV = values[upper];
            console.assert(lowerV != upperV, "values should be distinct", lowerV, upperV);
            console.assert(lowerV <= x && x <= upperV, `percentile_scale(${x}): lowerV=${lowerV}, x=${x}, upperV=${upperV}`, {
                'x': x,
                'values': values,
                'lower': lower,
                'domain_idx': domain_idx,
            });
            const a = (x - lowerV) / (upperV - lowerV);
            pctile = (lower + a) / (domain_idx[1] - domain_idx[0]);
        }
        return scaleOutput(pctile);
    };
    function invert(y) {
        y = scaleOutput.invert(y) * (domain_idx[1] - domain_idx[0]);
        y = Math.min(y, domain_idx[1]);
        y = Math.max(y, domain_idx[0]);
        const lower = Math.floor(y);
        const upper = Math.ceil(y);
        if (lower == upper) {
            return values[lower];
        }
        const a = y - lower;
        return values[upper] * a + values[lower] * (1 - a);
    };
    function range_fn(r) {
        if (r === undefined) {
            return scaleOutput.range();
        }
        scaleOutput.range(r);
        return scale;
    };
    function domain_idx_fn(new_domain_idx) {
        domain_idx = new_domain_idx;
        return scale;
    }
    function domain_fn(d) {
        if (d === undefined) {
            return [values[domain_idx[0]], values[domain_idx[1]]];
        }
        domain_idx = [d3.bisect(values, d[0]), d3.bisect(values, d[1])];
        if (domain_idx[0] == domain_idx[1]) {
            domain_idx[0] -= 1;
            domain_idx[1] += 1;
        }
        domain_idx[0] = domain_idx[0] < 0 ? 0 : domain_idx[0];
        domain_idx[1] = domain_idx[1] >= values.length ? values.length - 1 : domain_idx[1];
        return scale;
    };
    function copy() {
        var new_scale = d3_scale_percentile_values_sorted(values);
        new_scale.domain_idx(domain_idx);
        new_scale.range(scaleOutput.range());
        return new_scale;
    };
    function ticks(n: number): number[] {
        if (n >= domain_idx[1] - domain_idx[0] + 1) {
            return values.slice(domain_idx[0], domain_idx[1] + 1)
        }
        var t = [];
        for (var i = 0; i < n; ++i) {
            // Find the roundest number in the intervalle
            var start_idx = domain_idx[0] + Math.floor(i / n * (domain_idx[1] - domain_idx[0]));
            var end_dx = domain_idx[0] + Math.floor((i + 1) / n * (domain_idx[1] - domain_idx[0]));
            var start = values[start_idx];
            var end = end_dx > domain_idx[1] ? values[domain_idx[1]] : values[end_dx];
            var val;
            if (start == end) {
                val = start;
            }
            else {
                var precision = 1;
                var prev = i > 0 ? t[t.length - 1] : start;
                while (precision < 20 && toPrecisionFloor(prev, precision) == toPrecisionFloor(end, precision)) {
                    ++precision;
                }
                val = parseFloat(((prev + end) / 2).toPrecision(precision));
            }
            if (i > 0 && t[i - 1] == val) {
                continue;
            }
            t.push(val);
        }
        return t;
    };
    function tickFormat() {
        return function(val: number): string {
            var precision = 1;
            while (precision < 20 && parseFloat(val.toPrecision(precision)) != val) {
                ++precision;
            }
            return val.toPrecision(precision);
        }
    }
    Object.assign(scale, {
        'invert': invert,
        'copy': copy,
        'range': range_fn,
        'domain': domain_fn,
        'domain_idx': domain_idx_fn,
        'tickFormat': tickFormat,
        'ticks': ticks,
    });

    return scale;
}

function cpy_properties(from, to) {
    for (var prop in from){
        if (from.hasOwnProperty(prop)){
        to[prop] = from[prop];
        }
    }
}

export function scale_add_outliers(scale_orig) {
    /**
     * This functions adds NaN/Inf/-Inf to any d3 scale.
     * One tick is added for these special values as well.
     */
    /**
     * There are 2 options:
     * -  Either the scale is in ascending order (range[1] > range[0])
     *      In that case we have
     *      [ original scale values ] [inf / nan]
     *      ^                        ^
     *      |                        |
     *    range[0]            range[0]+origin_scale_size
     * - Or we are not in ascending order, in that case the values are
     *      [inf / nan] | [ original scale values ]
     *      ^           ^                          ^
     *      |           |                          |
     *    range[1]  range[0]-origin_scale_size   range[0]
     */
    function compute_origin_scale_size() {
        var h = Math.abs(scale_orig.range()[1] - scale_orig.range()[0]);
        return h - 30;
    }
    var scale: any = function(x) {
      var range = scale_orig.range();
      var origin_scale_size = compute_origin_scale_size();
      var ascending_order = range[0] < range[1];
      if (is_special_numeric(x)) {
          return range[1];
      }
      var scale_orig_value_rel = (scale_orig(x) - range[0]) / (range[1] - range[0]) * origin_scale_size;
      return ascending_order ? range[0] + scale_orig_value_rel : range[0] - scale_orig_value_rel;
    };
    function invert(y) {
        var range = scale_orig.range();
        var origin_scale_size = compute_origin_scale_size();
        var ascending_order = range[0] < range[1];
        if (ascending_order) {
            if (y > range[0]+origin_scale_size) { // Infinite domain
                return range[1];
            }
            y -= range[0];
        }
        else {
            if (y < range[0]-origin_scale_size) {  // Infinite domain
                return range[0];
            }
            y = -y + range[0];
        }
        y = (y / origin_scale_size * (range[1] - range[0]));
        y += range[0];
        return scale_orig.invert(y);
    };
    cpy_properties(scale_orig, scale);

    var new_ticks = {}, new_tickFormat = {};
    Object.assign(scale, {
        'invert': invert,
        '__scale_orig': scale_orig,
        'ticks': new_ticks,
        'tickFormat': new_tickFormat,
    });

    cpy_properties(scale_orig.ticks, new_ticks);
    cpy_properties(scale_orig.tickFormat, new_tickFormat);
    scale.ticks.apply = function(scale, tickArguments_) {
      var args = [tickArguments_[0] - 1];
      var ret = scale_orig.ticks.apply(scale_orig, args);
      ret.push(NaN);
      return ret;
    };
    scale.tickFormat.apply = function(scale, tickArguments_) {
      var args = [tickArguments_[0]];
      var fn = scale_orig.tickFormat.apply(scale_orig, args);
      return function(x) {
        if (Number.isNaN(x)) {
          return 'nan/inf/null';
        }
        return fn(x);
      }
    };
    scale.range = function(new_range) {
      if (new_range === undefined) {
        return scale_orig.range();
      }
      return scale_orig.range(new_range);
    };
    scale.copy = function() {
      return scale_add_outliers(scale_orig.copy());
    };
    return scale;
}

function wrap_scale<T, V>(scale_orig: any, domain_to_scale: (x: T) => V, scale_to_domain: (x: V) => T): any {
    var scale: any = function(x: T): number {
        return scale_orig(domain_to_scale(x));
    }
    function domain(new_domain?: [T, T]) {
        if (new_domain === undefined) {
            const scale_domain = scale_orig.domain();
            return [scale_to_domain(scale_domain[0]), scale_to_domain(scale_domain[1])];
        }
        scale_orig.domain([domain_to_scale(new_domain[0]), domain_to_scale(new_domain[1])]);
        return scale;
    };
    function invert(y: number) {
        return scale_to_domain(scale_orig.invert(y));
    };
    function copy() {
        return wrap_scale(scale_orig.copy(), domain_to_scale, scale_to_domain);
    };
    function range() {
        const r = scale_orig.range.apply(scale_orig, arguments);
        return r == scale_orig ? scale : r;
    }

    var new_ticks = {}, new_tickFormat = {};
    cpy_properties(scale_orig, scale);
    Object.assign(scale, {
        'domain': domain,
        'range': range,
        'invert': invert,
        'copy': copy,
        '__scale_orig': scale_orig,
        'ticks': new_ticks,
        'tickFormat': new_tickFormat,
    });
    cpy_properties(scale_orig.ticks, new_ticks);
    cpy_properties(scale_orig.tickFormat, new_tickFormat);
    scale.ticks.apply = function(_, tickArguments_) {
        var args = [tickArguments_[0]];
        const ta = scale_orig.ticks.apply(scale_orig, args);
        return ta.map(scale_to_domain);
    };
    scale.tickFormat.apply = function(_, tickArguments_) {
        var args = [tickArguments_[0]];
        var fn = scale_orig.tickFormat.apply(scale_orig, args);
        return function(x) {
          return fn(domain_to_scale(x));
        }
    };
    return scale;
}

export function d3_scale_timestamp() {
    // There is a trick: usually timestamps are in seconds, but JS timestamps are in ms
    function timestamp_to_jsdate(timestamp: any): Date {
        if (timestamp instanceof Date) {
            return timestamp;
        }
        return new Date(timestamp * 1000);
    }
    function jsdate_to_timestamp(date: Date): number {
        return date.getTime() / 1000;
    }
    const ts = wrap_scale(d3.scaleTime(), timestamp_to_jsdate, jsdate_to_timestamp);
    return ts;
}
