import { Expect } from '..';

export const moveDown = (chain: Expect, nMoves: number) => chain.sendKeyDown(nMoves);

export const moveUp = (chain: Expect, nMoves: number) => chain.sendKeyUp(nMoves);

export const singleSelect = <T>(chain: Expect, item: T, allChoices: T[]) => multiSelect(chain, [item], allChoices);

export const multiSelect = <T>(chain: Expect, items: T[] = [], allChoices: T[]) => {
  items
    .map(item => allChoices.indexOf(item))
    .filter(idx => idx > -1)
    .sort()
    // calculate the diff with the latest, since items are sorted, always positive
    // represents the numbers of moves down we need to make to selection
    .reduce((diffs, move) => (diffs.length > 0 ? [...diffs, move - diffs[diffs.length - 1]] : [move]), [] as number[])
    .reduce((chain, move) => moveDown(chain, move).send(' '), chain);
  chain.sendCarriageReturn();
  return chain;
};
