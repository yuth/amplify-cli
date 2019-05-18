import { PluginValidateFn, PluginFunction } from '@graphql-codegen/plugin-helpers';
import { RawClientSideBasePluginConfig } from '@graphql-codegen/visitor-plugin-common';
export interface AmplifyCodegenPluginAngularConfig extends RawClientSideBasePluginConfig {
    avoidOptionals: boolean;
    immutableTypes: boolean;
}
export declare const plugin: PluginFunction<AmplifyCodegenPluginAngularConfig>;
export declare const validate: PluginValidateFn<any>;
