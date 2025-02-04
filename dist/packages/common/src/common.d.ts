import type { CommonMetadata, ViteBuildData, WebpackBuildData } from './types';
export declare const getCommonMetadata: (timeTaken: number, customIdentifier?: string) => CommonMetadata;
export declare const sendBuildData: (buildStats: WebpackBuildData | ViteBuildData) => Promise<void>;
