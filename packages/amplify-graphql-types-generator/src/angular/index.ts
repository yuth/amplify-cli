import * as prettier from 'prettier';
import { LegacyCompilerContext } from '../compiler/legacyIR';

import { parse, printSchema } from 'graphql';
import { codegen } from '@graphql-codegen/core';
import * as addPlugin from '@graphql-codegen/add';
import * as angularPlugin from 'amplify-codegen-plugin-angular';
import * as typescriptPlugin from '@graphql-codegen/typescript';

export async function generateSource(context: LegacyCompilerContext) {
  const filename = 'codegen.ts';
  const schema = parse(printSchema(context.schema));
  const fragments = Object.keys(context.fragments).map(name => {
    return {
      filePath: context.fragments[name].filePath || '',
      content: parse(context.fragments[name].source)
    };
  });
  const operations = Object.keys(context.operations).map(name => {
    return {
      filePath: context.operations[name].filePath || '',
      content: parse(context.operations[name].source)
    };
  });
  const documents = [...fragments, ...operations];

  const output = await codegen({
    filename,
    schema,
    documents,
    plugins: [
      {
        add: [
          '/* tslint:disable */',
          '//  This file was automatically generated and should not be edited.'
        ]
      },
      { typescriptPlugin: {}},
      { 'z-amplify-codegen-plugin-angular': {} } // prefixed with z- to put the serice at the end of file
    ],
    config: {},
    pluginMap: {
      add: addPlugin,
      typescriptPlugin,
      'z-amplify-codegen-plugin-angular': angularPlugin // prefixed with z- to put the serice at the end of file
    }
  });

  return prettier.format(output, { parser: 'typescript' });
}
