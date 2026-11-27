# Flint

Flint lets a seller change a packing slip template by chatting, without touching the Liquid.

## Editing a slip

**Original**:
The template the working slip is compared against: as opened, or as last saved.

**Working slip**:
The latest version of the template in the editor; what the next request to Flint edits.
_Avoid_: draft, current template

**Version**:
One template source in the editor's history, produced by one turn's edit (or the original).

**Turn**:
One exchange in the chat: the seller's message and Flint's outcome.

**Undone turn**:
A turn whose edit was undone. It stays in the chat with an "Undone" mark and Flint forgets it.

**Redo stack**:
The undone versions waiting to be reapplied, most recently undone on top. Sending any message empties it, and its undone turns then stay undone for good.
_Avoid_: redo history

## Pointing at the slip

**Part**:
An element of the working slip that has a class, at any depth: the logo, the order number, the items table, an SKU column. Only parts can be selected; anything finer, the seller describes in words.
_Avoid_: element, region (in anything the seller reads)

**Section**:
A top-level part of the slip, such as the header, ship-to, items table, totals or thank-you line. The first click on the slip selects a section; each further click inside the selection goes one part finer.

**Selection**:
The part the seller picked on the working slip. Flint is told only enough to find it in the template: the part's name and its opening tag, copied from the template source, plus which occurrence it is when that tag appears more than once. It never describes the rendered slip, since Flint never sees the example orders. It travels with the turn, stays in the history Flint sees, and clears whenever the working slip re-renders (after an edit, Undo or Redo, or an example-order switch).
_Avoid_: highlight, focus
