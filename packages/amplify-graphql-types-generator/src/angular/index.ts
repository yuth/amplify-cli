import * as prettier from 'prettier';
import { LegacyCompilerContext } from '../compiler/legacyIR';

import { parse, printSchema } from 'graphql';
import { codegen } from '@graphql-codegen/core';
import * as addPlugin from '@graphql-codegen/add';
import * as angularPlugin from 'amplify-codegen-plugin-angular';

export async function generateSource(context: LegacyCompilerContext) {
  const filename = 'foobarbaz.ts';
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
      { 'amplify-codegen-plugin-angular': {} }
    ],
    config: {},
    pluginMap: {
      add: addPlugin,
      'amplify-codegen-plugin-angular': angularPlugin
    }
  });

  return prettier.format(output, { parser: 'typescript' });
}
