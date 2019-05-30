import { isPlainObject } from 'lodash';
import { isString } from "util";
import { CloudFormationParseContext, CloudFormationWalkContext } from './types';


const intrinsicFunctionNameMap = {
  'Fn::Join': 'join',
  'Fn::Sub': 'sub',
  'Fn::GetAtt': 'getAtt',
  'Fn::Split': 'split',
  'Ref': 'ref',
  'Fn::Select': 'select',
  'Fn::If': 'if',
  'Fn::Equals': 'equals',
  'Fn::And': 'and',
  'Fn::Or': 'or',
  'Fn::Not': 'not',
  'Condition': 'condition'
};

function visit(node, visitor, context = createDefaultContext()) {

  if(isString(node)) {
    return node;
  }
  if (
    isPlainObject(node) &&
    Object.keys(node).length === 1 &&
    Object.keys(intrinsicFunctionNameMap).includes(Object.keys(node)[0])
  ) {
    const op = Object.keys(node)[0];
    const valNode = node[op];
    return intrinsicFunctionNameMap[op](valNode, context, visit);
  }
  throw new Error(`Could not process value node ${JSON.stringify(node)}`);
}

function createDefaultContext():CloudFormationParseContext {
  return {
    conditions: {},
    exports: {},
    params: {},
    resources: {}
  };
}

export function walkJoin(node, visitor, context) {
  if (!(Array.isArray(node) && node.length === 2)) {
    throw new Error(
      `FN::Join expects an array with 2 elements instead got ${JSON.stringify(node)}`
    );
  }
  const enterFn = getVisitFn(visitor, 'join', false);
  const leaveFn = getVisitFn(visitor, 'join', true);
  if(enterFn) {
    const result = enterFn(node)
  }


}

export function getVisitFn(
  visitor: any,
  kind: string,
  isLeaving: boolean,
):any {
  const kindVisitor = visitor[kind];
  if (kindVisitor) {
    if (!isLeaving && typeof kindVisitor === 'function') {
      // { Kind() {} }
      return kindVisitor;
    }
    const kindSpecificVisitor = isLeaving
      ? kindVisitor.leave
      : kindVisitor.enter;
    if (typeof kindSpecificVisitor === 'function') {
      // { Kind: { enter() {}, leave() {} } }
      return kindSpecificVisitor;
    }
  } else {
    const specificVisitor = isLeaving ? visitor.leave : visitor.enter;
    if (specificVisitor) {
      if (typeof specificVisitor === 'function') {
        // { enter() {}, leave() {} }
        return specificVisitor;
      }
      const specificKindVisitor = specificVisitor[kind];
      if (typeof specificKindVisitor === 'function') {
        // { enter: { Kind() {} }, leave: { Kind() {} } }
        return specificKindVisitor;
      }
    }
  }
}

class CFNVisitor {
  join(node: object, context: CloudFormationWalkContext): string {
    if (!(Array.isArray(node) && node.length === 2)) {
      throw new Error(
        `FN::Join expects an array with 2 elements instead got ${JSON.stringify(node)}`
      );
    }
    const delimiter = node[0];
    const items = node[1].map(item => context.walkFn(item, context));
    return items.join(delimiter);
  }

  sub(node: any[], context: CloudFormationWalkContext): string {
    if (!(Array.isArray(node) && node.length !== 2)) {
      throw new Error(
        `FN::Sub expects an array with 2 elements instead got ${JSON.stringify(node)}`
      );
    }
    const strTemplate = node[0];
    const subs = node[1];

    if (!isString(strTemplate)) {
      throw new Error(
        `FN::Sub expects template to be an a string instead got ${JSON.stringify(strTemplate)}`
      );
    }
    if (!isPlainObject(subs)) {
      throw new Error(
        `FN::Sub expects substitution to be an object instead got ${JSON.stringify(subs)}`
      );
    }
    const subValues = {};
    Object.entries(subs).forEach(([key, value]) => {
      subValues[key] = context.walkFn(value, context);
    });

    const result = Object.entries(subValues).reduce((template, entry:any) => {
      const regExp = new RegExp(`\\$\\{${entry[0]}\\}`, 'g');
      return template.replace(regExp, entry[1]);
    }, strTemplate);
    return result;
  }
}