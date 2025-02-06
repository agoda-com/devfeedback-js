import { OutputAsset, OutputBundle, OutputChunk } from 'rollup';

export function generateViteOutputBundleData(
  includeBootstrapChunk: boolean,
): OutputBundle {
  const bootstrapChunk: OutputChunk = {
    name: 'bootstrap',
    type: 'chunk',
    code:
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");',
  } as unknown as OutputChunk;

  const nonBootstrapChunkA: OutputChunk = {
    name: 'notBootstrapA',
    type: 'chunk',
    code: 'random sentence to pass my time',
  } as unknown as OutputChunk;

  const nonBootstrapChunkB: OutputChunk = {
    name: 'notBootstrapB',
    type: 'chunk',
    code: 'random sentence to pass my time again',
  } as unknown as OutputChunk;

  const assetNamedBootstrap: OutputAsset = {
    name: 'bootstrap',
    fileName: 'bootstrap.jpg',
    type: 'asset',
    source: '../../assets/bootstrap.jpg',
    needsCodeReference: false,
    names: [],
    originalFileName: null,
    originalFileNames: [],
  };

  const bundle: { [key: string]: OutputChunk | OutputAsset } = {
    'a-not-bootstrap.js': nonBootstrapChunkA,
    'b-not-bootstrap.js': nonBootstrapChunkB,
    'bootstrap.jpg': assetNamedBootstrap,
  };

  if (includeBootstrapChunk) {
    bundle['bootstrap.xyz123.js'] = bootstrapChunk;
  }

  return bundle;
}
