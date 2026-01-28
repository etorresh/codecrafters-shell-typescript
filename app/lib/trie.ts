class TrieNode {
  children: { [key: string]: TrieNode } = {};
  isWord = false;
}

export class Trie {
  root: TrieNode = new TrieNode();

  insert(word: string) {
    let node = this.root;
    for (let ch of word) {
      if (!(ch in node.children)) {
        node.children[ch] = new TrieNode();
      }
      node = node.children[ch];
    }
    node.isWord = true;
  }

  // if multiple words can autocomplete or no matches, then return null
  getCompletion(prefix: string): string | null {
    let node = this.root;
    for (let ch of prefix) {
      if (ch in node.children) {
        node = node.children[ch];
      } else {
        return null;
      }
    }

    const startingNode = node;
    let autocompleteBuilder: string[] = [];
    while (!node.isWord && Object.keys(node.children).length === 1) {
      const [key] = Object.keys(node.children);
      autocompleteBuilder.push(key);
      node = node.children[key];
    }
    if (node === startingNode) {
      return null;
    }

    // add space if word is complete
    if (Object.keys(node.children).length === 0) {
      autocompleteBuilder.push(" ");
    }
    return autocompleteBuilder.join("");
  }

  getPossibleCompletions(prefix: string): string[] {
    let startingNode = this.root;
    for (let ch of prefix) {
      startingNode = startingNode.children[ch];
    }
    const stack: [TrieNode, string][] = [[startingNode, prefix]];
    const availableCommands: string[] = [];
    while (stack.length > 0) {
      const [node, fileNameBuilder] = stack.pop()!;
      if (node.isWord) {
        availableCommands.push(fileNameBuilder);
      }
      for (const [key, value] of Object.entries(node.children)) {
        stack.push([value, fileNameBuilder + key])
      }
    }
    return availableCommands;
  }
}
