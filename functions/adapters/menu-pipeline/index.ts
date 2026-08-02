/**
 * Shared menu standardization pipeline for live adapters.
 *
 * @example
 * import { runMenuPipeline, buildFieldBlob, fuzz } from './menu-pipeline';
 * import { kfcMenuRules } from './kfc-menu-rules';
 * const result = runMenuPipeline({ name, description, posName, catLabel, price }, kfcMenuRules);
 */

export {
  normText,
  buildFieldBlob,
  fuzz,
  fuzzName,
  fuzzAny,
  fuzzMatch,
  runMenuPipeline,
  runMenuPipelineAll,
  type FieldBlob,
  type TextField,
  type ItemRole,
  type DisplayResolved,
  type MenuLineInput,
  type MenuPipelineRules,
  type PipelineResult,
} from './core';
