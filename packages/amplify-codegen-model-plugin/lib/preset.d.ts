import { Types } from '@graphql-codegen/plugin-helpers';
export declare type AppSyncModelCodeGenPresetConfig = {
    /**
     * @name target
     * @type string
     * @description Required, target language for codegen
     *
     * @example
     * ```yml
     * generates:
     * Models:
     *  preset: amplify-codegen-appsync-model-plugin
     *  presetConfig:
     *    target: java
     *  plugins:
     *    - amplify-codegen-appsync-model-plugin
     * ```
     */
    target: 'java' | 'android' | 'ios' | 'swift' | 'javascript' | 'typescript';
};
export declare const preset: Types.OutputPreset<AppSyncModelCodeGenPresetConfig>;
//# sourceMappingURL=preset.d.ts.map