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
