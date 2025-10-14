/**
 * The Atomizer services the transformation of Readwise data into atomized markdown files. It does two things (essentially):
 *
 * 1. It implements a new Nunjucks block type (atomizer) which takes a nunjucks template block and wraps it in a specific way.
 * 2. It provides a Nunjucks extension which will split a Markdown file into multiple files based on the atomizer blocks.
 *
 * The atomizer block takes at least the following arguments: filename, parent (id), embed (in parent file), and optionally frontmatter (tbc).
 *
 * The atomizer makes use of the fact that Nunjucks allows for a custom syntax (https://mozilla.github.io/nunjucks/api.html#customizing-syntax).
 * The idea is to render the initial Markdown file in a way that it represents a (new) Nunjucks template which can then be rendered a second time
 * in a way that extracts the atomizer blocks, writes the individual files, and links them together by adding an embed block in the "parent" file.
 */

import filenamify from 'filenamify';
import * as nunjucks from 'nunjucks';
import type { Atom, AtomizeOptions, BaseFile } from 'types';
import type { CallExtension, Context, Parser } from '../nunjucks-parser';

/**
 * Helper class to create a new atomizer Nunjucks environment primed with the AtomizeExtension.
 * This environment can then be used to render templates containing atomizer blocks.
 */
export class Atomizer {
  atoms: Atom[] = [];
  private _env: nunjucks.Environment = new nunjucks.Environment(undefined, {
    autoescape: false,
    tags: {
      blockStart: '%%!',
      blockEnd: '!%%',
      variableStart: '%%$',
      variableEnd: '$%%',
      commentStart: '%%%',
      commentEnd: '%%%',
    },
  });
  constructor() {
    this._env.addExtension('AtomizeExtension', new AtomizeExtension(this.atoms));
  }

  /**
   * Render a template string with the atomizer environment.
   * @param _contents
   * @returns
   */

  // biome-ignore lint/suspicious/noExplicitAny: Context can be any object
  atomize(_contents: string, ctx: Record<string, any>): BaseFile {
    // Create a new ReadwiseDocument from the atomized content

    const contents = this._env.renderString(_contents, ctx);
    return {
      type: 'base',
      basename: ctx.basename,
      doc: ctx.doc,
      contents,
      atoms: this.atoms,
    };
  }
}

/**
 * Atomize Extension
 *
 * Creates atomic Markdown files from content blocks and links them together.
 * Supports frontmatter through dedicated subtags.
 *
 * Usage:
 * %%! atomize basename="<basename>", parent="parent-id", embed=true !%%
 *   {% frontmatter %}
 *   title: My Note
 *   tags: [tag1, tag2]
 *   {% endfrontmatter %}
 *   Content to be atomized
 * %%! endatomize !%%
 */
export class AtomizeExtension implements nunjucks.Extension {
  tags: string[] = ['atomize', 'frontmatter'];

  // Initialize atoms
  constructor(private atoms: Atom[]) {}

  // biome-ignore lint/suspicious/noExplicitAny: Context can be any object
  parse(parser: Parser, nodes: any): Promise<CallExtension> {
    // Get the tag token
    const tok = parser.nextToken();

    switch (tok.value) {
      case 'atomize': {
        // Parse arguments
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // Parse main content
        const body = parser.parseUntilBlocks('endatomize');
        parser.advanceAfterBlockEnd();
        return new nodes.CallExtension(this, 'runAtomize', args, [body]);
      }
      case 'frontmatter': {
        // Get the tag token
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // Get frontmatter block
        const frontmatter = parser.parseUntilBlocks('endfrontmatter');
        parser.advanceAfterBlockEnd();
        return new nodes.CallExtension(this, 'runFrontmatter', args, [frontmatter]);
      }
    }
  }

  /**
   * Run Atomize
   *
   * This function processes an atomizer block and creates an atomic representation of the content.
   */
  runAtomize(
    _context: Context, // Context would hold the current rendering context, i.e. variables
    args: AtomizeOptions,
    body: () => string
  ): nunjucks.runtime.SafeString {
    const { id, basename, embed } = args;

    // Validate the arguments as follows:
    // - id and parent are required and must be non-empty numbers
    if (Number.isNaN(id) || Number(id) <= 0) {
      throw new Error(`Invalid parameter in atomizer template, 'id' must be a positive number. ${id}`);
    }

    // Extract frontmatter (if present)
    let content = body().trim();
    const frontmatterMatch = content.match(/FRONTMATTER:START(.*?)FRONTMATTER:END/s);
    let frontmatter = '';
    if (frontmatterMatch) {
      frontmatter = frontmatterMatch[1].trim();
      content = content.replace(frontmatterMatch[0], '').trim();
    }

    // Sanitize filename
    const _basename = filenamify(basename.trim() ?? id.toString(), {
      replacement: '-',
      maxLength: 252,
    })
      .replace(/[#]+/g, ' ')
      .replace(/ +/g, ' ')
      .trim();

    const atom: Atom = {
      id: Number(id),
      basename: _basename,
      content,
      frontmatter,
      isEmbedded: embed,
    };
    // Get the content, add to the list of atoms, and return the embed, if enabled
    this.atoms.push(atom);
    // Return embed link
    return new nunjucks.runtime.SafeString(embed ? `![[${_basename}]]` : '');
  }

  /**
   * Run Frontmatter
   *
   * This function processes the frontmatter block within an atomizer block.
   * It simply wraps the frontmatter content in identifiable tags for later extraction.
   */
  runFrontmatter(_context: Context, frontmatter: () => string): nunjucks.runtime.SafeString {
    // Simply wrap the frontmatter body in identifiable tags
    return new nunjucks.runtime.SafeString(`FRONTMATTER:START\n---\n${frontmatter().trim()}\n---\nFRONTMATTER:END`);
  }
}
