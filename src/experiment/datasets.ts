import { genRandomName } from './utils';
import { CreateTestCase, CreateTestCaseCollection } from '../types';

/**
 * Create a test case collection from a dictionary of test cases.
 *
 * @param data = list of key-value pairs where keys represent input names.
 *   Each item in the list represent a test case row.
 *   Target and Tags are reserved keys. There can only be one target and tags key per dict item.
 *   If target is present it will represent the target/expected response for the inputs.
 *   If tags are present they must be a list of json_serializable values.
 * @param name - A unique name for the test collection. If not provided a random name will be generated.
 * @returns CreateTestCaseCollection
 */
export function createTestCollection(data: Record<string, any>[], name?: string): CreateTestCaseCollection {
  if (!name) {
    name = genRandomName();
  }

  const columnNames = Array.from(
    new Set(data.flatMap((row) => Object.keys(row).filter((key) => key !== 'target' && key !== 'tags'))),
  );
  const testCases = createTestCases(data);

  return {
    name,
    column_names: columnNames,
    test_cases: testCases,
  };
}

/**
 * Create a list of test cases from a dictionary.
 *
 * @param data = list of key-value pairs where keys represent input names.
 *   Each item in the list represent a test case row.
 *   Target and Tags are reserved keys. There can only be one target and tags key per dict item.
 *   If target is present it will represent the target/expected response for the inputs.
 *   If tags are present they must be a list of json_serializable values.
 * @returns CreateTestCase[]
 */
export function createTestCases(data: Record<string, any>[]): CreateTestCase[] {
  const testCases: CreateTestCase[] = [];

  data.forEach((row) => {
    const inputs: Record<string, string> = {};
    let target: string | undefined;
    let tags: string[] = [];

    Object.entries(row).forEach(([k, v]) => {
      if (k === 'target') {
        if (target !== undefined) {
          console.warn('There can only be one target key per test case. Only the first target will be used.');
        }
        target = JSON.stringify(v, null, 2);
      } else if (k === 'tags') {
        if (!Array.isArray(v)) {
          throw new Error('Tags must be a list of json serializable values.');
        }
        if (tags.length > 0) {
          console.warn('There can only be one tags key per test case. Only the first set of tags will be used.');
        }
        tags = v.map((tag) => (typeof tag === 'string' ? tag : JSON.stringify(tag, null, 2)));
      } else {
        inputs[k] = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      }
    });

    testCases.push({ inputs, target, tags });
  });

  return testCases;
}
