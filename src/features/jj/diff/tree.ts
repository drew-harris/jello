export interface FileTreeNode {
  name: string
  path: string
  index?: number
  children: FileTreeNode[]
}

export function buildFileTree(files: { name: string; prevName?: string }[], query = ""): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", children: [] }
  files.forEach((file, index) => {
    if (!`${file.name} ${file.prevName ?? ""}`.toLowerCase().includes(query.toLowerCase())) return
    let parent = root
    const parts = file.name.split("/")
    parts.forEach((name, depth) => {
      const path = parts.slice(0, depth + 1).join("/")
      let node = parent.children.find((child) => child.path === path)
      if (!node) {
        node = { name, path, children: [] }
        parent.children.push(node)
      }
      if (depth === parts.length - 1) node.index = index
      parent = node
    })
  })
  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => Number(b.index === undefined) - Number(a.index === undefined) || a.name.localeCompare(b.name))
    nodes.forEach((node) => sort(node.children))
  }
  sort(root.children)
  return root.children
}
