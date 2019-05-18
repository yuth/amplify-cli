import { LegacyCompilerContext } from '../compiler/legacyIR';
import { printSchema, parse } from 'graphql';
import { codegen } from '@graphql-codegen/core';
import * as addPlugin from '@graphql-codegen/add';
import * as tsPlugin from '@graphql-codegen/typescript';
import * as tsOpPlugin from '@graphql-codegen/typescript-operations';

export async function generateSource(context: LegacyCompilerContext) {
  const filename = 'graphql.ts';
  const schema = parse(printSchema(context.schema));
  const fragments = Object.keys(context.fragments).map(name => {
    return {
      filePath: context.fragments[name].filePath || '',
      content: parse(context.fragments[name].source),
    };
  });
  const operations = Object.keys(context.operations).map(name => {
    return {
      filePath: context.operations[name].filePath || '',
      content: parse(context.operations[name].source),
    };
  });
  const documents = [...fragments, ...operations];
  return codegen({
    filename,
    schema,
    documents,
    plugins: [
      {
        add: [
          '/* tslint:disable */',
          '//  This file was automatically generated and should not be edited.',
        ],
        typescript: {},
        'typescript-operations': {},
      },
    ],
    config: {},
    pluginMap: {
      add: addPlugin,
      typescript: tsPlugin,
      'typescript-operations': tsOpPlugin,
    },
  });
}
