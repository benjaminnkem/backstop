/** Example tests: copy to scaffold and install/configure Vitest if needed. */
import { describe, expect, it } from 'vitest';
import { simulate } from './reference-simulator';
import type { GraphSnapshot } from './domain-types';

const root = (id: string) => ({ resourceId: id, capability: 'access' as const, mode: 'independent' as const, confidence: 'verified' as const });
const dependent = (id: string) => ({ resourceId: id, capability: 'access' as const, mode: 'dependent' as const, confidence: 'verified' as const });
const R = (id: string) => ({ id, name: id, kind: 'service', criticality: 'high' as const });

function graph(mode: 'ALL' | 'ANY', confidence: 'verified' | 'assumed' = 'verified'): GraphSnapshot {
  return {
    resources: [R('a'),R('b'),R('c')],
    capabilities: [dependent('a'),root('b'),root('c')],
    groups: [{id:'g',resourceId:'a',capability:'access',requirementMode:mode,label:'route'}],
    links: [
      {id:'lb',groupId:'g',prerequisiteResourceId:'b',prerequisiteCapability:'access',confidence},
      {id:'lc',groupId:'g',prerequisiteResourceId:'c',prerequisiteCapability:'access',confidence:'verified'},
    ],
  };
}
function state(g: GraphSnapshot, failed: {resourceId:string; capability:'access'}[], id='a') {
  return simulate(g, failed).impacts.find(x=>x.resourceId===id && x.capability==='access')!.status;
}

describe('BACKSTOP deterministic reference', () => {
  it('ALL blocks when one required prerequisite fails', () => {
    expect(state(graph('ALL'),[{resourceId:'b',capability:'access'}])).toBe('blocked');
  });
  it('ANY remains available when an independent alternative survives', () => {
    expect(state(graph('ANY'),[{resourceId:'b',capability:'access'}])).toBe('available');
  });
  it('ANY blocks when all alternatives fail', () => {
    expect(state(graph('ANY'),[{resourceId:'b',capability:'access'},{resourceId:'c',capability:'access'}])).toBe('blocked');
  });
  it('assumed dependency does not yield a false confirmed block', () => {
    expect(state(graph('ALL','assumed'),[{resourceId:'b',capability:'access'}])).toBe('at_risk');
    // ALL with a verified failed c is confirmed blocked even if b is assumed.
    expect(state(graph('ALL','assumed'),[{resourceId:'b',capability:'access'}, {resourceId:'c',capability:'access'}])).toBe('blocked');
  });
  it('missing capability baseline is not marked available', () => {
    const g = graph('ANY'); g.capabilities = g.capabilities.filter(x=>x.resourceId!=='c');
    expect(state(g,[{resourceId:'b',capability:'access'}])).toBe('unknown');
  });
  it('results are independent of link ordering', () => {
    const a = graph('ANY'); const b = {...a, links:[...a.links].reverse()};
    expect(simulate(a,[{resourceId:'b',capability:'access'}]).summary).toEqual(simulate(b,[{resourceId:'b',capability:'access'}]).summary);
  });
});
