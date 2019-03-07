import { LegacyCompilerContext } from '../compiler/legacyIR';
import { printSchema } from 'graphql';
import { executeCodegen } from 'graphql-code-generator';

export async function generateSource(context: LegacyCompilerContext) {
  const filename = 'graphql.ts';
  const schema = printSchema(context.schema);
  const fragments = Object.keys(context.fragments).map(
    name => context.fragments[name].source,
  );
  const operations = Object.keys(context.operations).map(
    name => context.operations[name].source,
  );
  const documents = [...fragments, ...operations].join('\n\n');
  const results = await executeCodegen({
    schema,
    documents,
    generates: {
      [filename]: {
        config: {
          noNamespaces: true,
        },
        plugins: {
          add: [
            '/* tslint:disable */',
            '//  This file was automatically generated and should not be edited.',
          ],
          'typescript-common': {},
          'typescript-client': {},
        },
      },
    },
  });

  return results.find(f => f.filename === filename)!.content;
}
