import { escapeHtml, page, paragraph } from './webview-html'

import type { Story } from '../../engine/src/story/story-schema'

/**
 * The Map panel (#752, section 8): one box per file on the story's map,
 * marked by what it is, the links between files, and the architecture
 * note. Clicking a box sends `{ type: 'open_file', path }`.
 */

type MapFile = Story['map']['files'][number]
type MapLink = Story['map']['links'][number]

/** The marks on a file's box, such as `start here` and `new`. */
const marksOf = ({
    file,
    entry_path,
}: {
    file: MapFile
    entry_path: string
}): string[] => [
    ...(file.path === entry_path ? ['start here'] : []),
    ...(file.status === 'added' ? ['new'] : []),
    ...(file.status === 'deleted' ? ['deleted'] : []),
    ...(file.status === 'renamed' && file.previous_path !== null
        ? [`renamed from ${file.previous_path}`]
        : []),
    ...(file.in_walk ? [] : ['loose end']),
]

const box = ({ file, entry_path }: { file: MapFile; entry_path: string }) => {
    const marks = marksOf({ file, entry_path })
        .map(
            (mark) => `<span class="mark">${escapeHtml({ text: mark })}</span>`
        )
        .join(' ')
    return [
        `<div class="box" data-path="${escapeHtml({ text: file.path })}">`,
        `<p><strong>${escapeHtml({ text: file.path })}</strong></p>`,
        paragraph({ text: file.role }),
        marks === '' ? '' : `<p>${marks}</p>`,
        '</div>',
    ].join('\n')
}

/**
 * A link as one line.
 *
 * @example
 * linkLine({ link }) // 'src/a.ts calls src/b.ts - on every ticket'
 */
export const linkLine = ({ link }: { link: MapLink }): string => {
    const line = `${link.from_path} ${link.kind} ${link.to_path}`
    return link.note === null ? line : `${line} - ${link.note}`
}

const STYLE = `<style>
.box { border: 1px solid; border-radius: 4px; padding: 0 8px; margin: 8px 0; cursor: pointer; }
.mark { border: 1px solid; border-radius: 3px; padding: 0 4px; margin-right: 4px; }
</style>`

/** The Map panel's HTML for `story`. */
export const mapHtml = ({ story }: { story: Story }): string => {
    const { map } = story
    const links =
        map.links.length === 0
            ? ''
            : `<ul>${map.links
                  .map(
                      (link) =>
                          `<li>${escapeHtml({ text: linkLine({ link }) })}</li>`
                  )
                  .join('')}</ul>`
    return page({
        title: `Map of #${story.pr_number}`,
        body: [
            STYLE,
            paragraph({ text: map.architecture_note }),
            ...map.files.map((file) =>
                box({ file, entry_path: map.entry_path })
            ),
            links,
        ].join('\n'),
    })
}
