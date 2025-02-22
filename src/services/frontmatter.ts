import * as YAML from 'yaml';

/**
 * Custom error class for Frontmatter-related errors
 */
export class FrontmatterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

/**
 * Type definitions for Frontmatter values and data
 */
type PrimitiveValue = string | number | boolean | Date;
type FrontmatterValue =
  | PrimitiveValue
  | Array<PrimitiveValue>
  | Record<string, PrimitiveValue | Array<PrimitiveValue>>;
export type FrontmatterData = Record<string, FrontmatterValue>;

/**
 * Represents and manages YAML frontmatter in markdown documents
 */
export class Frontmatter {
  public static readonly DELIMITER = '---';
  public static readonly REGEX = /^(---\n([\s\S]*?)\n---\s*)/;

  private readonly data: FrontmatterData;

  /**
   * Creates a new Frontmatter instance
   */
  constructor(data: FrontmatterData = {}) {
    this.data = this.validateData(data);
  }

  /**
   * Validates frontmatter data using YAML parse/stringify
   */
  private validateData(data: FrontmatterData): FrontmatterData {
    try {
      const yamlString = YAML.stringify(data);
      const parsed = YAML.parse(yamlString);

      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Frontmatter must be an object');
      }

      return parsed as FrontmatterData;
    } catch (error) {
      throw new FrontmatterError('Invalid frontmatter data', error);
    }
  }

  /**
   * Gets a value from the frontmatter
   */
  public get<T extends FrontmatterValue>(key: string): T | undefined {
    return this.data[key] as T;
  }

  /**
   * Gets a value from the frontmatter or throws if it doesn't exist
   */
  public getOrThrow<T extends FrontmatterValue>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new FrontmatterError(`Required frontmatter key "${key}" not found`);
    }
    return value;
  }

  /**
   * Sets a value in the frontmatter
   */
  public set(key: string, value: FrontmatterValue): this {
    const newData = { ...this.data, [key]: value };
    this.validateData(newData); // Validate before updating
    this.data[key] = value;
    return this;
  }

  /**
   * Checks if a key exists in the frontmatter
   */
  public has(key: string): boolean {
    return key in this.data;
  }

  /**
   * Deletes a key from the frontmatter
   */
  public delete(key: string): boolean {
    return delete this.data[key];
  }

  /**
   * Gets all keys in the frontmatter
   */
  public keys(): string[] {
    return Object.keys(this.data);
  }

  /**
   * Gets all values in the frontmatter
   */
  public values(): FrontmatterValue[] {
    return Object.values(this.data);
  }

  /**
   * Creates a new Frontmatter instance from an array of key-value pairs
   */
  public static fromEntries(entries: Array<[string, FrontmatterValue]>): Frontmatter {
    return new Frontmatter(Object.fromEntries(entries));
  }

  /**
   * Gets all entries in the frontmatter
   */
  public entries(): Array<[string, FrontmatterValue]> {
    return Object.entries(this.data);
  }

  /**
   * Merges additional frontmatter data into the current instance
   */
  public merge(updates: Frontmatter | FrontmatterData): this {
    const updateData = updates instanceof Frontmatter ? updates.toObject() : updates;
    const newData = { ...this.data, ...updateData };
    this.validateData(newData); // Validate merged data
    Object.assign(this.data, updateData);
    return this;
  }

  /**
   * Converts the frontmatter to a YAML string
   */
  public toString(): string {
    if (Object.keys(this.data).length === 0) {
      return '';
    }

    return [Frontmatter.DELIMITER, YAML.stringify(this.data).trim(), Frontmatter.DELIMITER].join('\n');
  }

  /**
   * Converts the frontmatter to a plain object
   */
  public toObject(): FrontmatterData {
    return { ...this.data };
  }

  /**
   * Creates a deep clone of the frontmatter
   */
  public clone(): Frontmatter {
    return new Frontmatter(this.toObject());
  }

  /**
   * Creates a Frontmatter instance from a YAML string
   */
  public static fromString(content: string): Frontmatter {
    if (!content.trim()) {
      return new Frontmatter();
    }

    const match = content.match(Frontmatter.REGEX);
    if (!match) {
      return new Frontmatter();
    }

    try {
      const yamlContent = match[2];
      const data = YAML.parse(yamlContent);

      if (typeof data !== 'object' || data === null) {
        throw new Error('Frontmatter must be an object');
      }

      return new Frontmatter(data as FrontmatterData);
    } catch (error) {
      throw new FrontmatterError('Failed to parse frontmatter', error);
    }
  }

  /**
   * Checks if a string contains valid frontmatter
   */
  public static isValid(content: string): boolean {
    try {
      Frontmatter.fromString(content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Iterator implementation
   */
  public [Symbol.iterator](): Iterator<[string, FrontmatterValue]> {
    return this.entries()[Symbol.iterator]();
  }
}
