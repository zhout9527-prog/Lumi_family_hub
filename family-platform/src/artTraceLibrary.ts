// 本文件由 scripts/generate-art-trace-library.mjs 从 lucide-react 0.468.0 官方源文件生成。
// Lucide 使用 ISC 许可证，来源：https://lucide.dev/

export type ArtTraceDifficulty = 'easy' | 'medium'

export type ArtTraceNode = readonly [
  tag: 'path' | 'circle' | 'ellipse' | 'line' | 'rect' | 'polyline' | 'polygon',
  attributes: Readonly<Record<string, string | number>>,
]

export interface ArtTraceSource {
  id: string
  title: string
  category: string
  difficulty: ArtTraceDifficulty
  accent: string
  sourceName: string
  sourceUrl: string
  nodes: readonly ArtTraceNode[]
}

export const ART_TRACE_SOURCES = [
  {
    "id": "lucide-cat",
    "title": "好奇小猫",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "cat",
    "sourceUrl": "https://lucide.dev/icons/cat",
    "nodes": [
      [
        "path",
        {
          "d": "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"
        }
      ],
      [
        "path",
        {
          "d": "M8 14v.5"
        }
      ],
      [
        "path",
        {
          "d": "M16 14v.5"
        }
      ],
      [
        "path",
        {
          "d": "M11.25 16.25h1.5L12 17l-.75-.75Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-dog",
    "title": "快乐小狗",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "dog",
    "sourceUrl": "https://lucide.dev/icons/dog",
    "nodes": [
      [
        "path",
        {
          "d": "M11.25 16.25h1.5L12 17z"
        }
      ],
      [
        "path",
        {
          "d": "M16 14v.5"
        }
      ],
      [
        "path",
        {
          "d": "M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"
        }
      ],
      [
        "path",
        {
          "d": "M8 14v.5"
        }
      ],
      [
        "path",
        {
          "d": "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"
        }
      ]
    ]
  },
  {
    "id": "lucide-rabbit",
    "title": "长耳兔",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "rabbit",
    "sourceUrl": "https://lucide.dev/icons/rabbit",
    "nodes": [
      [
        "path",
        {
          "d": "M13 16a3 3 0 0 1 2.24 5"
        }
      ],
      [
        "path",
        {
          "d": "M18 12h.01"
        }
      ],
      [
        "path",
        {
          "d": "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"
        }
      ],
      [
        "path",
        {
          "d": "M20 8.54V4a2 2 0 1 0-4 0v3"
        }
      ],
      [
        "path",
        {
          "d": "M7.612 12.524a3 3 0 1 0-1.6 4.3"
        }
      ]
    ]
  },
  {
    "id": "lucide-squirrel",
    "title": "松鼠",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "squirrel",
    "sourceUrl": "https://lucide.dev/icons/squirrel",
    "nodes": [
      [
        "path",
        {
          "d": "M15.236 22a3 3 0 0 0-2.2-5"
        }
      ],
      [
        "path",
        {
          "d": "M16 20a3 3 0 0 1 3-3h1a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4V4"
        }
      ],
      [
        "path",
        {
          "d": "M18 13h.01"
        }
      ],
      [
        "path",
        {
          "d": "M18 6a4 4 0 0 0-4 4 7 7 0 0 0-7 7c0-5 4-5 4-10.5a4.5 4.5 0 1 0-9 0 2.5 2.5 0 0 0 5 0C7 10 3 11 3 17c0 2.8 2.2 5 5 5h10"
        }
      ]
    ]
  },
  {
    "id": "lucide-turtle",
    "title": "小海龟",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "turtle",
    "sourceUrl": "https://lucide.dev/icons/turtle",
    "nodes": [
      [
        "path",
        {
          "d": "m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z"
        }
      ],
      [
        "path",
        {
          "d": "M4.82 7.9 8 10"
        }
      ],
      [
        "path",
        {
          "d": "M15.18 7.9 12 10"
        }
      ],
      [
        "path",
        {
          "d": "M16.93 10H20a2 2 0 0 1 0 4H2"
        }
      ]
    ]
  },
  {
    "id": "lucide-snail",
    "title": "蜗牛",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "snail",
    "sourceUrl": "https://lucide.dev/icons/snail",
    "nodes": [
      [
        "path",
        {
          "d": "M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0"
        }
      ],
      [
        "circle",
        {
          "cx": "10",
          "cy": "13",
          "r": "8"
        }
      ],
      [
        "path",
        {
          "d": "M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6"
        }
      ],
      [
        "path",
        {
          "d": "M18 3 19.1 5.2"
        }
      ],
      [
        "path",
        {
          "d": "M22 3 20.9 5.2"
        }
      ]
    ]
  },
  {
    "id": "lucide-worm",
    "title": "小蚯蚓",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "worm",
    "sourceUrl": "https://lucide.dev/icons/worm",
    "nodes": [
      [
        "path",
        {
          "d": "m19 12-1.5 3"
        }
      ],
      [
        "path",
        {
          "d": "M19.63 18.81 22 20"
        }
      ],
      [
        "path",
        {
          "d": "M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z"
        }
      ]
    ]
  },
  {
    "id": "lucide-bird",
    "title": "枝头小鸟",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "bird",
    "sourceUrl": "https://lucide.dev/icons/bird",
    "nodes": [
      [
        "path",
        {
          "d": "M16 7h.01"
        }
      ],
      [
        "path",
        {
          "d": "M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"
        }
      ],
      [
        "path",
        {
          "d": "m20 7 2 .5-2 .5"
        }
      ],
      [
        "path",
        {
          "d": "M10 18v3"
        }
      ],
      [
        "path",
        {
          "d": "M14 17.75V21"
        }
      ],
      [
        "path",
        {
          "d": "M7 18a6 6 0 0 0 3.84-10.61"
        }
      ]
    ]
  },
  {
    "id": "lucide-fish",
    "title": "小鱼",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "fish",
    "sourceUrl": "https://lucide.dev/icons/fish",
    "nodes": [
      [
        "path",
        {
          "d": "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"
        }
      ],
      [
        "path",
        {
          "d": "M18 12v.5"
        }
      ],
      [
        "path",
        {
          "d": "M16 17.93a9.77 9.77 0 0 1 0-11.86"
        }
      ],
      [
        "path",
        {
          "d": "M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"
        }
      ],
      [
        "path",
        {
          "d": "M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"
        }
      ],
      [
        "path",
        {
          "d": "m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"
        }
      ]
    ]
  },
  {
    "id": "lucide-bug",
    "title": "小甲虫",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "bug",
    "sourceUrl": "https://lucide.dev/icons/bug",
    "nodes": [
      [
        "path",
        {
          "d": "m8 2 1.88 1.88"
        }
      ],
      [
        "path",
        {
          "d": "M14.12 3.88 16 2"
        }
      ],
      [
        "path",
        {
          "d": "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"
        }
      ],
      [
        "path",
        {
          "d": "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"
        }
      ],
      [
        "path",
        {
          "d": "M12 20v-9"
        }
      ],
      [
        "path",
        {
          "d": "M6.53 9C4.6 8.8 3 7.1 3 5"
        }
      ],
      [
        "path",
        {
          "d": "M6 13H2"
        }
      ],
      [
        "path",
        {
          "d": "M3 21c0-2.1 1.7-3.9 3.8-4"
        }
      ],
      [
        "path",
        {
          "d": "M20.97 5c0 2.1-1.6 3.8-3.5 4"
        }
      ],
      [
        "path",
        {
          "d": "M22 13h-4"
        }
      ],
      [
        "path",
        {
          "d": "M17.2 17c2.1.1 3.8 1.9 3.8 4"
        }
      ]
    ]
  },
  {
    "id": "lucide-rat",
    "title": "小老鼠",
    "category": "动物伙伴",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "rat",
    "sourceUrl": "https://lucide.dev/icons/rat",
    "nodes": [
      [
        "path",
        {
          "d": "M17 5c0-1.7-1.3-3-3-3s-3 1.3-3 3c0 .8.3 1.5.8 2H11c-3.9 0-7 3.1-7 7c0 2.2 1.8 4 4 4"
        }
      ],
      [
        "path",
        {
          "d": "M16.8 3.9c.3-.3.6-.5 1-.7 1.5-.6 3.3.1 3.9 1.6.6 1.5-.1 3.3-1.6 3.9l1.6 2.8c.2.3.2.7.2 1-.2.8-.9 1.2-1.7 1.1 0 0-1.6-.3-2.7-.6H17c-1.7 0-3 1.3-3 3"
        }
      ],
      [
        "path",
        {
          "d": "M13.2 18a3 3 0 0 0-2.2-5"
        }
      ],
      [
        "path",
        {
          "d": "M13 22H4a2 2 0 0 1 0-4h12"
        }
      ],
      [
        "path",
        {
          "d": "M16 9h.01"
        }
      ]
    ]
  },
  {
    "id": "lucide-shell",
    "title": "海螺",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "shell",
    "sourceUrl": "https://lucide.dev/icons/shell",
    "nodes": [
      [
        "path",
        {
          "d": "M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44"
        }
      ]
    ]
  },
  {
    "id": "lucide-paw-print",
    "title": "动物脚印",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "paw-print",
    "sourceUrl": "https://lucide.dev/icons/paw-print",
    "nodes": [
      [
        "circle",
        {
          "cx": "11",
          "cy": "4",
          "r": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "8",
          "r": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "20",
          "cy": "16",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-bone",
    "title": "小骨头",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "bone",
    "sourceUrl": "https://lucide.dev/icons/bone",
    "nodes": [
      [
        "path",
        {
          "d": "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-egg",
    "title": "生命之蛋",
    "category": "动物伙伴",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "egg",
    "sourceUrl": "https://lucide.dev/icons/egg",
    "nodes": [
      [
        "path",
        {
          "d": "M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z"
        }
      ]
    ]
  },
  {
    "id": "lucide-flower",
    "title": "六瓣花",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "flower",
    "sourceUrl": "https://lucide.dev/icons/flower",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "3"
        }
      ],
      [
        "path",
        {
          "d": "M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"
        }
      ],
      [
        "path",
        {
          "d": "M12 7.5V9"
        }
      ],
      [
        "path",
        {
          "d": "M7.5 12H9"
        }
      ],
      [
        "path",
        {
          "d": "M16.5 12H15"
        }
      ],
      [
        "path",
        {
          "d": "M12 16.5V15"
        }
      ],
      [
        "path",
        {
          "d": "m8 8 1.88 1.88"
        }
      ],
      [
        "path",
        {
          "d": "M14.12 9.88 16 8"
        }
      ],
      [
        "path",
        {
          "d": "m8 16 1.88-1.88"
        }
      ],
      [
        "path",
        {
          "d": "M14.12 14.12 16 16"
        }
      ]
    ]
  },
  {
    "id": "lucide-flower-2",
    "title": "盛开的花",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "flower-2",
    "sourceUrl": "https://lucide.dev/icons/flower-2",
    "nodes": [
      [
        "path",
        {
          "d": "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "8",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M12 10v12"
        }
      ],
      [
        "path",
        {
          "d": "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-sprout",
    "title": "小幼苗",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "sprout",
    "sourceUrl": "https://lucide.dev/icons/sprout",
    "nodes": [
      [
        "path",
        {
          "d": "M7 20h10"
        }
      ],
      [
        "path",
        {
          "d": "M10 20c5.5-2.5.8-6.4 3-10"
        }
      ],
      [
        "path",
        {
          "d": "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"
        }
      ],
      [
        "path",
        {
          "d": "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"
        }
      ]
    ]
  },
  {
    "id": "lucide-leaf",
    "title": "一片叶子",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "leaf",
    "sourceUrl": "https://lucide.dev/icons/leaf",
    "nodes": [
      [
        "path",
        {
          "d": "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
        }
      ],
      [
        "path",
        {
          "d": "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"
        }
      ]
    ]
  },
  {
    "id": "lucide-tree-deciduous",
    "title": "落叶树",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "tree-deciduous",
    "sourceUrl": "https://lucide.dev/icons/tree-deciduous",
    "nodes": [
      [
        "path",
        {
          "d": "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 19v3"
        }
      ]
    ]
  },
  {
    "id": "lucide-tree-pine",
    "title": "松树",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "tree-pine",
    "sourceUrl": "https://lucide.dev/icons/tree-pine",
    "nodes": [
      [
        "path",
        {
          "d": "m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 22v-3"
        }
      ]
    ]
  },
  {
    "id": "lucide-tree-palm",
    "title": "棕榈树",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "tree-palm",
    "sourceUrl": "https://lucide.dev/icons/tree-palm",
    "nodes": [
      [
        "path",
        {
          "d": "M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"
        }
      ],
      [
        "path",
        {
          "d": "M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"
        }
      ],
      [
        "path",
        {
          "d": "M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"
        }
      ],
      [
        "path",
        {
          "d": "M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"
        }
      ]
    ]
  },
  {
    "id": "lucide-trees",
    "title": "小树林",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "trees",
    "sourceUrl": "https://lucide.dev/icons/trees",
    "nodes": [
      [
        "path",
        {
          "d": "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M7 16v6"
        }
      ],
      [
        "path",
        {
          "d": "M13 19v3"
        }
      ],
      [
        "path",
        {
          "d": "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"
        }
      ]
    ]
  },
  {
    "id": "lucide-clover",
    "title": "四叶草",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "clover",
    "sourceUrl": "https://lucide.dev/icons/clover",
    "nodes": [
      [
        "path",
        {
          "d": "M16.17 7.83 2 22"
        }
      ],
      [
        "path",
        {
          "d": "M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12"
        }
      ],
      [
        "path",
        {
          "d": "m7.83 7.83 8.34 8.34"
        }
      ]
    ]
  },
  {
    "id": "lucide-wheat",
    "title": "麦穗",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "wheat",
    "sourceUrl": "https://lucide.dev/icons/wheat",
    "nodes": [
      [
        "path",
        {
          "d": "M2 22 16 8"
        }
      ],
      [
        "path",
        {
          "d": "M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"
        }
      ],
      [
        "path",
        {
          "d": "M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"
        }
      ],
      [
        "path",
        {
          "d": "M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"
        }
      ],
      [
        "path",
        {
          "d": "M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"
        }
      ],
      [
        "path",
        {
          "d": "M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-cherry",
    "title": "樱桃",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "cherry",
    "sourceUrl": "https://lucide.dev/icons/cherry",
    "nodes": [
      [
        "path",
        {
          "d": "M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z"
        }
      ],
      [
        "path",
        {
          "d": "M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12"
        }
      ],
      [
        "path",
        {
          "d": "M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-apple",
    "title": "苹果",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "apple",
    "sourceUrl": "https://lucide.dev/icons/apple",
    "nodes": [
      [
        "path",
        {
          "d": "M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"
        }
      ],
      [
        "path",
        {
          "d": "M10 2c1 .5 2 2 2 5"
        }
      ]
    ]
  },
  {
    "id": "lucide-banana",
    "title": "香蕉",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "banana",
    "sourceUrl": "https://lucide.dev/icons/banana",
    "nodes": [
      [
        "path",
        {
          "d": "M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5"
        }
      ],
      [
        "path",
        {
          "d": "M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-grape",
    "title": "葡萄",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "grape",
    "sourceUrl": "https://lucide.dev/icons/grape",
    "nodes": [
      [
        "path",
        {
          "d": "M22 5V2l-5.89 5.89"
        }
      ],
      [
        "circle",
        {
          "cx": "16.6",
          "cy": "15.89",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "8.11",
          "cy": "7.4",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "12.35",
          "cy": "11.65",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "13.91",
          "cy": "5.85",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "18.15",
          "cy": "10.09",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "6.56",
          "cy": "13.2",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "10.8",
          "cy": "17.44",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "5",
          "cy": "19",
          "r": "3"
        }
      ]
    ]
  },
  {
    "id": "lucide-carrot",
    "title": "胡萝卜",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "carrot",
    "sourceUrl": "https://lucide.dev/icons/carrot",
    "nodes": [
      [
        "path",
        {
          "d": "M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 0 0-6.36-6.37C5.77 11.84 2.27 21.7 2.27 21.7zM8.64 14l-2.05-2.04M15.34 15l-2.46-2.46"
        }
      ],
      [
        "path",
        {
          "d": "M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9z"
        }
      ],
      [
        "path",
        {
          "d": "M15 2s-2 1.33-2 3.5S15 9 15 9s2-1.84 2-3.5C17 3.33 15 2 15 2z"
        }
      ]
    ]
  },
  {
    "id": "lucide-citrus",
    "title": "柑橘",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "citrus",
    "sourceUrl": "https://lucide.dev/icons/citrus",
    "nodes": [
      [
        "path",
        {
          "d": "M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04z"
        }
      ],
      [
        "path",
        {
          "d": "M19.65 15.66A8 8 0 0 1 8.35 4.34"
        }
      ],
      [
        "path",
        {
          "d": "m14 10-5.5 5.5"
        }
      ],
      [
        "path",
        {
          "d": "M14 17.85V10H6.15"
        }
      ]
    ]
  },
  {
    "id": "lucide-bean",
    "title": "豆子",
    "category": "植物与食物",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "bean",
    "sourceUrl": "https://lucide.dev/icons/bean",
    "nodes": [
      [
        "path",
        {
          "d": "M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z"
        }
      ],
      [
        "path",
        {
          "d": "M5.341 10.62a4 4 0 1 0 5.279-5.28"
        }
      ]
    ]
  },
  {
    "id": "lucide-nut",
    "title": "坚果",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "nut",
    "sourceUrl": "https://lucide.dev/icons/nut",
    "nodes": [
      [
        "path",
        {
          "d": "M12 4V2"
        }
      ],
      [
        "path",
        {
          "d": "M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592A7.003 7.003 0 0 0 19 14v-4"
        }
      ],
      [
        "path",
        {
          "d": "M12 4C8 4 4.5 6 4 8c-.243.97-.919 1.952-2 3 1.31-.082 1.972-.29 3-1 .54.92.982 1.356 2 2 1.452-.647 1.954-1.098 2.5-2 .595.995 1.151 1.427 2.5 2 1.31-.621 1.862-1.058 2.5-2 .629.977 1.162 1.423 2.5 2 1.209-.548 1.68-.967 2-2 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-salad",
    "title": "蔬菜沙拉",
    "category": "植物与食物",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "salad",
    "sourceUrl": "https://lucide.dev/icons/salad",
    "nodes": [
      [
        "path",
        {
          "d": "M7 21h10"
        }
      ],
      [
        "path",
        {
          "d": "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"
        }
      ],
      [
        "path",
        {
          "d": "M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"
        }
      ],
      [
        "path",
        {
          "d": "m13 12 4-4"
        }
      ],
      [
        "path",
        {
          "d": "M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"
        }
      ]
    ]
  },
  {
    "id": "lucide-sun",
    "title": "太阳",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "sun",
    "sourceUrl": "https://lucide.dev/icons/sun",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "4"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v2"
        }
      ],
      [
        "path",
        {
          "d": "M12 20v2"
        }
      ],
      [
        "path",
        {
          "d": "m4.93 4.93 1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "m17.66 17.66 1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h2"
        }
      ],
      [
        "path",
        {
          "d": "M20 12h2"
        }
      ],
      [
        "path",
        {
          "d": "m6.34 17.66-1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "m19.07 4.93-1.41 1.41"
        }
      ]
    ]
  },
  {
    "id": "lucide-moon",
    "title": "月亮",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "moon",
    "sourceUrl": "https://lucide.dev/icons/moon",
    "nodes": [
      [
        "path",
        {
          "d": "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-star",
    "title": "星星",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "star",
    "sourceUrl": "https://lucide.dev/icons/star",
    "nodes": [
      [
        "path",
        {
          "d": "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        }
      ]
    ]
  },
  {
    "id": "lucide-cloud",
    "title": "云朵",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "cloud",
    "sourceUrl": "https://lucide.dev/icons/cloud",
    "nodes": [
      [
        "path",
        {
          "d": "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-cloud-sun",
    "title": "云后的太阳",
    "category": "天空与自然",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "cloud-sun",
    "sourceUrl": "https://lucide.dev/icons/cloud-sun",
    "nodes": [
      [
        "path",
        {
          "d": "M12 2v2"
        }
      ],
      [
        "path",
        {
          "d": "m4.93 4.93 1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "M20 12h2"
        }
      ],
      [
        "path",
        {
          "d": "m19.07 4.93-1.41 1.41"
        }
      ],
      [
        "path",
        {
          "d": "M15.947 12.65a4 4 0 0 0-5.925-4.128"
        }
      ],
      [
        "path",
        {
          "d": "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-rainbow",
    "title": "彩虹",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "rainbow",
    "sourceUrl": "https://lucide.dev/icons/rainbow",
    "nodes": [
      [
        "path",
        {
          "d": "M22 17a10 10 0 0 0-20 0"
        }
      ],
      [
        "path",
        {
          "d": "M6 17a6 6 0 0 1 12 0"
        }
      ],
      [
        "path",
        {
          "d": "M10 17a2 2 0 0 1 4 0"
        }
      ]
    ]
  },
  {
    "id": "lucide-snowflake",
    "title": "雪花",
    "category": "天空与自然",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "snowflake",
    "sourceUrl": "https://lucide.dev/icons/snowflake",
    "nodes": [
      [
        "line",
        {
          "x1": "2",
          "x2": "22",
          "y1": "12",
          "y2": "12"
        }
      ],
      [
        "line",
        {
          "x1": "12",
          "x2": "12",
          "y1": "2",
          "y2": "22"
        }
      ],
      [
        "path",
        {
          "d": "m20 16-4-4 4-4"
        }
      ],
      [
        "path",
        {
          "d": "m4 8 4 4-4 4"
        }
      ],
      [
        "path",
        {
          "d": "m16 4-4 4-4-4"
        }
      ],
      [
        "path",
        {
          "d": "m8 20 4-4 4 4"
        }
      ]
    ]
  },
  {
    "id": "lucide-mountain",
    "title": "山峰",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "mountain",
    "sourceUrl": "https://lucide.dev/icons/mountain",
    "nodes": [
      [
        "path",
        {
          "d": "m8 3 4 8 5-5 5 15H2L8 3z"
        }
      ]
    ]
  },
  {
    "id": "lucide-mountain-snow",
    "title": "雪山",
    "category": "天空与自然",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "mountain-snow",
    "sourceUrl": "https://lucide.dev/icons/mountain-snow",
    "nodes": [
      [
        "path",
        {
          "d": "m8 3 4 8 5-5 5 15H2L8 3z"
        }
      ],
      [
        "path",
        {
          "d": "M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"
        }
      ]
    ]
  },
  {
    "id": "lucide-waves",
    "title": "海浪",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "waves",
    "sourceUrl": "https://lucide.dev/icons/waves",
    "nodes": [
      [
        "path",
        {
          "d": "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
        }
      ],
      [
        "path",
        {
          "d": "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
        }
      ],
      [
        "path",
        {
          "d": "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
        }
      ]
    ]
  },
  {
    "id": "lucide-wind",
    "title": "风",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "wind",
    "sourceUrl": "https://lucide.dev/icons/wind",
    "nodes": [
      [
        "path",
        {
          "d": "M12.8 19.6A2 2 0 1 0 14 16H2"
        }
      ],
      [
        "path",
        {
          "d": "M17.5 8a2.5 2.5 0 1 1 2 4H2"
        }
      ],
      [
        "path",
        {
          "d": "M9.8 4.4A2 2 0 1 1 11 8H2"
        }
      ]
    ]
  },
  {
    "id": "lucide-tornado",
    "title": "龙卷风",
    "category": "天空与自然",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "tornado",
    "sourceUrl": "https://lucide.dev/icons/tornado",
    "nodes": [
      [
        "path",
        {
          "d": "M21 4H3"
        }
      ],
      [
        "path",
        {
          "d": "M18 8H6"
        }
      ],
      [
        "path",
        {
          "d": "M19 12H9"
        }
      ],
      [
        "path",
        {
          "d": "M16 16h-6"
        }
      ],
      [
        "path",
        {
          "d": "M11 20H9"
        }
      ]
    ]
  },
  {
    "id": "lucide-earth",
    "title": "地球",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "earth",
    "sourceUrl": "https://lucide.dev/icons/earth",
    "nodes": [
      [
        "path",
        {
          "d": "M21.54 15H17a2 2 0 0 0-2 2v4.54"
        }
      ],
      [
        "path",
        {
          "d": "M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"
        }
      ],
      [
        "path",
        {
          "d": "M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ]
    ]
  },
  {
    "id": "lucide-globe",
    "title": "地球仪",
    "category": "天空与自然",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "globe",
    "sourceUrl": "https://lucide.dev/icons/globe",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h20"
        }
      ]
    ]
  },
  {
    "id": "lucide-umbrella",
    "title": "雨伞",
    "category": "天空与自然",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "umbrella",
    "sourceUrl": "https://lucide.dev/icons/umbrella",
    "nodes": [
      [
        "path",
        {
          "d": "M22 12a10.06 10.06 1 0 0-20 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 12v8a2 2 0 0 0 4 0"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v1"
        }
      ]
    ]
  },
  {
    "id": "lucide-rocket",
    "title": "火箭",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "rocket",
    "sourceUrl": "https://lucide.dev/icons/rocket",
    "nodes": [
      [
        "path",
        {
          "d": "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
        }
      ],
      [
        "path",
        {
          "d": "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
        }
      ],
      [
        "path",
        {
          "d": "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"
        }
      ],
      [
        "path",
        {
          "d": "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
        }
      ]
    ]
  },
  {
    "id": "lucide-satellite",
    "title": "人造卫星",
    "category": "科学与太空",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "satellite",
    "sourceUrl": "https://lucide.dev/icons/satellite",
    "nodes": [
      [
        "path",
        {
          "d": "M13 7 9 3 5 7l4 4"
        }
      ],
      [
        "path",
        {
          "d": "m17 11 4 4-4 4-4-4"
        }
      ],
      [
        "path",
        {
          "d": "m8 12 4 4 6-6-4-4Z"
        }
      ],
      [
        "path",
        {
          "d": "m16 8 3-3"
        }
      ],
      [
        "path",
        {
          "d": "M9 21a6 6 0 0 0-6-6"
        }
      ]
    ]
  },
  {
    "id": "lucide-telescope",
    "title": "天文望远镜",
    "category": "科学与太空",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "telescope",
    "sourceUrl": "https://lucide.dev/icons/telescope",
    "nodes": [
      [
        "path",
        {
          "d": "m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"
        }
      ],
      [
        "path",
        {
          "d": "m13.56 11.747 4.332-.924"
        }
      ],
      [
        "path",
        {
          "d": "m16 21-3.105-6.21"
        }
      ],
      [
        "path",
        {
          "d": "M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"
        }
      ],
      [
        "path",
        {
          "d": "m6.158 8.633 1.114 4.456"
        }
      ],
      [
        "path",
        {
          "d": "m8 21 3.105-6.21"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "lucide-atom",
    "title": "原子",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "atom",
    "sourceUrl": "https://lucide.dev/icons/atom",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "1"
        }
      ],
      [
        "path",
        {
          "d": "M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"
        }
      ],
      [
        "path",
        {
          "d": "M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-microscope",
    "title": "显微镜",
    "category": "科学与太空",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "microscope",
    "sourceUrl": "https://lucide.dev/icons/microscope",
    "nodes": [
      [
        "path",
        {
          "d": "M6 18h8"
        }
      ],
      [
        "path",
        {
          "d": "M3 22h18"
        }
      ],
      [
        "path",
        {
          "d": "M14 22a7 7 0 1 0 0-14h-1"
        }
      ],
      [
        "path",
        {
          "d": "M9 14h2"
        }
      ],
      [
        "path",
        {
          "d": "M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"
        }
      ],
      [
        "path",
        {
          "d": "M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"
        }
      ]
    ]
  },
  {
    "id": "lucide-flask-conical",
    "title": "实验烧瓶",
    "category": "科学与太空",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "flask-conical",
    "sourceUrl": "https://lucide.dev/icons/flask-conical",
    "nodes": [
      [
        "path",
        {
          "d": "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"
        }
      ],
      [
        "path",
        {
          "d": "M6.453 15h11.094"
        }
      ],
      [
        "path",
        {
          "d": "M8.5 2h7"
        }
      ]
    ]
  },
  {
    "id": "lucide-test-tube",
    "title": "试管",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "test-tube",
    "sourceUrl": "https://lucide.dev/icons/test-tube",
    "nodes": [
      [
        "path",
        {
          "d": "M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2"
        }
      ],
      [
        "path",
        {
          "d": "M8.5 2h7"
        }
      ],
      [
        "path",
        {
          "d": "M14.5 16h-5"
        }
      ]
    ]
  },
  {
    "id": "lucide-magnet",
    "title": "磁铁",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "magnet",
    "sourceUrl": "https://lucide.dev/icons/magnet",
    "nodes": [
      [
        "path",
        {
          "d": "m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"
        }
      ],
      [
        "path",
        {
          "d": "m5 8 4 4"
        }
      ],
      [
        "path",
        {
          "d": "m12 15 4 4"
        }
      ]
    ]
  },
  {
    "id": "lucide-lightbulb",
    "title": "灯泡",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "lightbulb",
    "sourceUrl": "https://lucide.dev/icons/lightbulb",
    "nodes": [
      [
        "path",
        {
          "d": "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
        }
      ],
      [
        "path",
        {
          "d": "M9 18h6"
        }
      ],
      [
        "path",
        {
          "d": "M10 22h4"
        }
      ]
    ]
  },
  {
    "id": "lucide-school",
    "title": "学校",
    "category": "科学与太空",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "school",
    "sourceUrl": "https://lucide.dev/icons/school",
    "nodes": [
      [
        "path",
        {
          "d": "M14 22v-4a2 2 0 1 0-4 0v4"
        }
      ],
      [
        "path",
        {
          "d": "m18 10 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.382a1 1 0 0 1 .553-.894L6 10"
        }
      ],
      [
        "path",
        {
          "d": "M18 5v17"
        }
      ],
      [
        "path",
        {
          "d": "m4 6 7.106-3.553a2 2 0 0 1 1.788 0L20 6"
        }
      ],
      [
        "path",
        {
          "d": "M6 5v17"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "9",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "lucide-book-open",
    "title": "打开的书",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "book-open",
    "sourceUrl": "https://lucide.dev/icons/book-open",
    "nodes": [
      [
        "path",
        {
          "d": "M12 7v14"
        }
      ],
      [
        "path",
        {
          "d": "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
        }
      ]
    ]
  },
  {
    "id": "lucide-pencil",
    "title": "铅笔",
    "category": "科学与太空",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "pencil",
    "sourceUrl": "https://lucide.dev/icons/pencil",
    "nodes": [
      [
        "path",
        {
          "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        }
      ],
      [
        "path",
        {
          "d": "m15 5 4 4"
        }
      ]
    ]
  },
  {
    "id": "lucide-bike",
    "title": "自行车",
    "category": "交通工具",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "bike",
    "sourceUrl": "https://lucide.dev/icons/bike",
    "nodes": [
      [
        "circle",
        {
          "cx": "18.5",
          "cy": "17.5",
          "r": "3.5"
        }
      ],
      [
        "circle",
        {
          "cx": "5.5",
          "cy": "17.5",
          "r": "3.5"
        }
      ],
      [
        "circle",
        {
          "cx": "15",
          "cy": "5",
          "r": "1"
        }
      ],
      [
        "path",
        {
          "d": "M12 17.5V14l-3-3 4-3 2 3h2"
        }
      ]
    ]
  },
  {
    "id": "lucide-car",
    "title": "小汽车",
    "category": "交通工具",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "car",
    "sourceUrl": "https://lucide.dev/icons/car",
    "nodes": [
      [
        "path",
        {
          "d": "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"
        }
      ],
      [
        "circle",
        {
          "cx": "7",
          "cy": "17",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M9 17h6"
        }
      ],
      [
        "circle",
        {
          "cx": "17",
          "cy": "17",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "lucide-bus",
    "title": "公交车",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "bus",
    "sourceUrl": "https://lucide.dev/icons/bus",
    "nodes": [
      [
        "path",
        {
          "d": "M8 6v6"
        }
      ],
      [
        "path",
        {
          "d": "M15 6v6"
        }
      ],
      [
        "path",
        {
          "d": "M2 12h19.6"
        }
      ],
      [
        "path",
        {
          "d": "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"
        }
      ],
      [
        "circle",
        {
          "cx": "7",
          "cy": "18",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M9 18h5"
        }
      ],
      [
        "circle",
        {
          "cx": "16",
          "cy": "18",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "lucide-truck",
    "title": "卡车",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "truck",
    "sourceUrl": "https://lucide.dev/icons/truck",
    "nodes": [
      [
        "path",
        {
          "d": "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"
        }
      ],
      [
        "path",
        {
          "d": "M15 18H9"
        }
      ],
      [
        "path",
        {
          "d": "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"
        }
      ],
      [
        "circle",
        {
          "cx": "17",
          "cy": "18",
          "r": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "7",
          "cy": "18",
          "r": "2"
        }
      ]
    ]
  },
  {
    "id": "lucide-train-front",
    "title": "火车",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "train-front",
    "sourceUrl": "https://lucide.dev/icons/train-front",
    "nodes": [
      [
        "path",
        {
          "d": "M8 3.1V7a4 4 0 0 0 8 0V3.1"
        }
      ],
      [
        "path",
        {
          "d": "m9 15-1-1"
        }
      ],
      [
        "path",
        {
          "d": "m15 15 1-1"
        }
      ],
      [
        "path",
        {
          "d": "M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"
        }
      ],
      [
        "path",
        {
          "d": "m8 19-2 3"
        }
      ],
      [
        "path",
        {
          "d": "m16 19 2 3"
        }
      ]
    ]
  },
  {
    "id": "lucide-tram-front",
    "title": "有轨电车",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "tram-front",
    "sourceUrl": "https://lucide.dev/icons/tram-front",
    "nodes": [
      [
        "rect",
        {
          "width": "16",
          "height": "16",
          "x": "4",
          "y": "3",
          "rx": "2"
        }
      ],
      [
        "path",
        {
          "d": "M4 11h16"
        }
      ],
      [
        "path",
        {
          "d": "M12 3v8"
        }
      ],
      [
        "path",
        {
          "d": "m8 19-2 3"
        }
      ],
      [
        "path",
        {
          "d": "m18 22-2-3"
        }
      ],
      [
        "path",
        {
          "d": "M8 15h.01"
        }
      ],
      [
        "path",
        {
          "d": "M16 15h.01"
        }
      ]
    ]
  },
  {
    "id": "lucide-plane",
    "title": "飞机",
    "category": "交通工具",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "plane",
    "sourceUrl": "https://lucide.dev/icons/plane",
    "nodes": [
      [
        "path",
        {
          "d": "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
        }
      ]
    ]
  },
  {
    "id": "lucide-ship",
    "title": "轮船",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "ship",
    "sourceUrl": "https://lucide.dev/icons/ship",
    "nodes": [
      [
        "path",
        {
          "d": "M12 10.189V14"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v3"
        }
      ],
      [
        "path",
        {
          "d": "M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"
        }
      ],
      [
        "path",
        {
          "d": "M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"
        }
      ],
      [
        "path",
        {
          "d": "M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"
        }
      ]
    ]
  },
  {
    "id": "lucide-sailboat",
    "title": "帆船",
    "category": "交通工具",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "sailboat",
    "sourceUrl": "https://lucide.dev/icons/sailboat",
    "nodes": [
      [
        "path",
        {
          "d": "M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"
        }
      ],
      [
        "path",
        {
          "d": "M21 14 10 2 3 14h18Z"
        }
      ],
      [
        "path",
        {
          "d": "M10 2v16"
        }
      ]
    ]
  },
  {
    "id": "lucide-tractor",
    "title": "拖拉机",
    "category": "交通工具",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "tractor",
    "sourceUrl": "https://lucide.dev/icons/tractor",
    "nodes": [
      [
        "path",
        {
          "d": "m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20"
        }
      ],
      [
        "path",
        {
          "d": "M16 18h-5"
        }
      ],
      [
        "path",
        {
          "d": "M18 5a1 1 0 0 0-1 1v5.573"
        }
      ],
      [
        "path",
        {
          "d": "M3 4h8.129a1 1 0 0 1 .99.863L13 11.246"
        }
      ],
      [
        "path",
        {
          "d": "M4 11V4"
        }
      ],
      [
        "path",
        {
          "d": "M7 15h.01"
        }
      ],
      [
        "path",
        {
          "d": "M8 10.1V4"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "18",
          "r": "2"
        }
      ],
      [
        "circle",
        {
          "cx": "7",
          "cy": "15",
          "r": "5"
        }
      ]
    ]
  },
  {
    "id": "lucide-house",
    "title": "房子",
    "category": "建筑与游乐",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "house",
    "sourceUrl": "https://lucide.dev/icons/house",
    "nodes": [
      [
        "path",
        {
          "d": "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"
        }
      ],
      [
        "path",
        {
          "d": "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        }
      ]
    ]
  },
  {
    "id": "lucide-building-2",
    "title": "高楼",
    "category": "建筑与游乐",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "building-2",
    "sourceUrl": "https://lucide.dev/icons/building-2",
    "nodes": [
      [
        "path",
        {
          "d": "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"
        }
      ],
      [
        "path",
        {
          "d": "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
        }
      ],
      [
        "path",
        {
          "d": "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"
        }
      ],
      [
        "path",
        {
          "d": "M10 6h4"
        }
      ],
      [
        "path",
        {
          "d": "M10 10h4"
        }
      ],
      [
        "path",
        {
          "d": "M10 14h4"
        }
      ],
      [
        "path",
        {
          "d": "M10 18h4"
        }
      ]
    ]
  },
  {
    "id": "lucide-castle",
    "title": "城堡",
    "category": "建筑与游乐",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "castle",
    "sourceUrl": "https://lucide.dev/icons/castle",
    "nodes": [
      [
        "path",
        {
          "d": "M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z"
        }
      ],
      [
        "path",
        {
          "d": "M18 11V4H6v7"
        }
      ],
      [
        "path",
        {
          "d": "M15 22v-4a3 3 0 0 0-3-3a3 3 0 0 0-3 3v4"
        }
      ],
      [
        "path",
        {
          "d": "M22 11V9"
        }
      ],
      [
        "path",
        {
          "d": "M2 11V9"
        }
      ],
      [
        "path",
        {
          "d": "M6 4V2"
        }
      ],
      [
        "path",
        {
          "d": "M18 4V2"
        }
      ],
      [
        "path",
        {
          "d": "M10 4V2"
        }
      ],
      [
        "path",
        {
          "d": "M14 4V2"
        }
      ]
    ]
  },
  {
    "id": "lucide-tent",
    "title": "帐篷",
    "category": "建筑与游乐",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "tent",
    "sourceUrl": "https://lucide.dev/icons/tent",
    "nodes": [
      [
        "path",
        {
          "d": "M3.5 21 14 3"
        }
      ],
      [
        "path",
        {
          "d": "M20.5 21 10 3"
        }
      ],
      [
        "path",
        {
          "d": "M15.5 21 12 15l-3.5 6"
        }
      ],
      [
        "path",
        {
          "d": "M2 21h20"
        }
      ]
    ]
  },
  {
    "id": "lucide-ferris-wheel",
    "title": "摩天轮",
    "category": "建筑与游乐",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "ferris-wheel",
    "sourceUrl": "https://lucide.dev/icons/ferris-wheel",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M12 2v4"
        }
      ],
      [
        "path",
        {
          "d": "m6.8 15-3.5 2"
        }
      ],
      [
        "path",
        {
          "d": "m20.7 7-3.5 2"
        }
      ],
      [
        "path",
        {
          "d": "M6.8 9 3.3 7"
        }
      ],
      [
        "path",
        {
          "d": "m20.7 17-3.5-2"
        }
      ],
      [
        "path",
        {
          "d": "m9 22 3-8 3 8"
        }
      ],
      [
        "path",
        {
          "d": "M8 22h8"
        }
      ],
      [
        "path",
        {
          "d": "M18 18.7a9 9 0 1 0-12 0"
        }
      ]
    ]
  },
  {
    "id": "lucide-roller-coaster",
    "title": "过山车",
    "category": "建筑与游乐",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "roller-coaster",
    "sourceUrl": "https://lucide.dev/icons/roller-coaster",
    "nodes": [
      [
        "path",
        {
          "d": "M6 19V5"
        }
      ],
      [
        "path",
        {
          "d": "M10 19V6.8"
        }
      ],
      [
        "path",
        {
          "d": "M14 19v-7.8"
        }
      ],
      [
        "path",
        {
          "d": "M18 5v4"
        }
      ],
      [
        "path",
        {
          "d": "M18 19v-6"
        }
      ],
      [
        "path",
        {
          "d": "M22 19V9"
        }
      ],
      [
        "path",
        {
          "d": "M2 19V9a4 4 0 0 1 4-4c2 0 4 1.33 6 4s4 4 6 4a4 4 0 1 0-3-6.65"
        }
      ]
    ]
  },
  {
    "id": "lucide-gift",
    "title": "礼物盒",
    "category": "建筑与游乐",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "gift",
    "sourceUrl": "https://lucide.dev/icons/gift",
    "nodes": [
      [
        "rect",
        {
          "x": "3",
          "y": "8",
          "width": "18",
          "height": "4",
          "rx": "1"
        }
      ],
      [
        "path",
        {
          "d": "M12 8v13"
        }
      ],
      [
        "path",
        {
          "d": "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"
        }
      ],
      [
        "path",
        {
          "d": "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"
        }
      ]
    ]
  },
  {
    "id": "lucide-cake-slice",
    "title": "蛋糕",
    "category": "美味食物",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "cake-slice",
    "sourceUrl": "https://lucide.dev/icons/cake-slice",
    "nodes": [
      [
        "circle",
        {
          "cx": "9",
          "cy": "7",
          "r": "2"
        }
      ],
      [
        "path",
        {
          "d": "M7.2 7.9 3 11v9c0 .6.4 1 1 1h16c.6 0 1-.4 1-1v-9c0-2-3-6-7-8l-3.6 2.6"
        }
      ],
      [
        "path",
        {
          "d": "M16 13H3"
        }
      ],
      [
        "path",
        {
          "d": "M16 17H3"
        }
      ]
    ]
  },
  {
    "id": "lucide-ice-cream-bowl",
    "title": "冰淇淋",
    "category": "美味食物",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "ice-cream-bowl",
    "sourceUrl": "https://lucide.dev/icons/ice-cream-bowl",
    "nodes": [
      [
        "path",
        {
          "d": "M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0"
        }
      ],
      [
        "path",
        {
          "d": "M12.14 11a3.5 3.5 0 1 1 6.71 0"
        }
      ],
      [
        "path",
        {
          "d": "M15.5 6.5a3.5 3.5 0 1 0-7 0"
        }
      ]
    ]
  },
  {
    "id": "lucide-pizza",
    "title": "披萨",
    "category": "美味食物",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "pizza",
    "sourceUrl": "https://lucide.dev/icons/pizza",
    "nodes": [
      [
        "path",
        {
          "d": "m12 14-1 1"
        }
      ],
      [
        "path",
        {
          "d": "m13.75 18.25-1.25 1.42"
        }
      ],
      [
        "path",
        {
          "d": "M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12"
        }
      ],
      [
        "path",
        {
          "d": "M18.8 9.3a1 1 0 0 0 2.1 7.7"
        }
      ],
      [
        "path",
        {
          "d": "M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z"
        }
      ]
    ]
  },
  {
    "id": "lucide-cookie",
    "title": "饼干",
    "category": "美味食物",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "cookie",
    "sourceUrl": "https://lucide.dev/icons/cookie",
    "nodes": [
      [
        "path",
        {
          "d": "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"
        }
      ],
      [
        "path",
        {
          "d": "M8.5 8.5v.01"
        }
      ],
      [
        "path",
        {
          "d": "M16 15.5v.01"
        }
      ],
      [
        "path",
        {
          "d": "M12 12v.01"
        }
      ],
      [
        "path",
        {
          "d": "M11 17v.01"
        }
      ],
      [
        "path",
        {
          "d": "M7 14v.01"
        }
      ]
    ]
  },
  {
    "id": "lucide-cup-soda",
    "title": "饮料杯",
    "category": "美味食物",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "cup-soda",
    "sourceUrl": "https://lucide.dev/icons/cup-soda",
    "nodes": [
      [
        "path",
        {
          "d": "m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"
        }
      ],
      [
        "path",
        {
          "d": "M5 8h14"
        }
      ],
      [
        "path",
        {
          "d": "M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"
        }
      ],
      [
        "path",
        {
          "d": "m12 8 1-6h2"
        }
      ]
    ]
  },
  {
    "id": "lucide-popcorn",
    "title": "爆米花",
    "category": "美味食物",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "popcorn",
    "sourceUrl": "https://lucide.dev/icons/popcorn",
    "nodes": [
      [
        "path",
        {
          "d": "M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4"
        }
      ],
      [
        "path",
        {
          "d": "M10 22 9 8"
        }
      ],
      [
        "path",
        {
          "d": "m14 22 1-14"
        }
      ],
      [
        "path",
        {
          "d": "M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-sandwich",
    "title": "三明治",
    "category": "美味食物",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "sandwich",
    "sourceUrl": "https://lucide.dev/icons/sandwich",
    "nodes": [
      [
        "path",
        {
          "d": "m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777"
        }
      ],
      [
        "path",
        {
          "d": "M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25"
        }
      ],
      [
        "path",
        {
          "d": "M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9"
        }
      ],
      [
        "path",
        {
          "d": "m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2"
        }
      ],
      [
        "rect",
        {
          "width": "20",
          "height": "4",
          "x": "2",
          "y": "11",
          "rx": "1"
        }
      ]
    ]
  },
  {
    "id": "lucide-soup",
    "title": "热汤",
    "category": "美味食物",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "soup",
    "sourceUrl": "https://lucide.dev/icons/soup",
    "nodes": [
      [
        "path",
        {
          "d": "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"
        }
      ],
      [
        "path",
        {
          "d": "M7 21h10"
        }
      ],
      [
        "path",
        {
          "d": "M19.5 12 22 6"
        }
      ],
      [
        "path",
        {
          "d": "M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62"
        }
      ],
      [
        "path",
        {
          "d": "M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62"
        }
      ],
      [
        "path",
        {
          "d": "M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"
        }
      ]
    ]
  },
  {
    "id": "lucide-utensils",
    "title": "餐具",
    "category": "美味食物",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "utensils",
    "sourceUrl": "https://lucide.dev/icons/utensils",
    "nodes": [
      [
        "path",
        {
          "d": "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"
        }
      ],
      [
        "path",
        {
          "d": "M7 2v20"
        }
      ],
      [
        "path",
        {
          "d": "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"
        }
      ]
    ]
  },
  {
    "id": "lucide-shirt",
    "title": "上衣",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "shirt",
    "sourceUrl": "https://lucide.dev/icons/shirt",
    "nodes": [
      [
        "path",
        {
          "d": "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"
        }
      ]
    ]
  },
  {
    "id": "lucide-crown",
    "title": "皇冠",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "crown",
    "sourceUrl": "https://lucide.dev/icons/crown",
    "nodes": [
      [
        "path",
        {
          "d": "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
        }
      ],
      [
        "path",
        {
          "d": "M5 21h14"
        }
      ]
    ]
  },
  {
    "id": "lucide-glasses",
    "title": "眼镜",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "glasses",
    "sourceUrl": "https://lucide.dev/icons/glasses",
    "nodes": [
      [
        "circle",
        {
          "cx": "6",
          "cy": "15",
          "r": "4"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "15",
          "r": "4"
        }
      ],
      [
        "path",
        {
          "d": "M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2"
        }
      ],
      [
        "path",
        {
          "d": "M2.5 13 5 7c.7-1.3 1.4-2 3-2"
        }
      ],
      [
        "path",
        {
          "d": "M21.5 13 19 7c-.7-1.3-1.5-2-3-2"
        }
      ]
    ]
  },
  {
    "id": "lucide-watch",
    "title": "手表",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "watch",
    "sourceUrl": "https://lucide.dev/icons/watch",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "6"
        }
      ],
      [
        "polyline",
        {
          "points": "12 10 12 12 13 13"
        }
      ],
      [
        "path",
        {
          "d": "m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"
        }
      ],
      [
        "path",
        {
          "d": "m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"
        }
      ]
    ]
  },
  {
    "id": "lucide-backpack",
    "title": "书包",
    "category": "生活用品",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "backpack",
    "sourceUrl": "https://lucide.dev/icons/backpack",
    "nodes": [
      [
        "path",
        {
          "d": "M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
        }
      ],
      [
        "path",
        {
          "d": "M8 10h8"
        }
      ],
      [
        "path",
        {
          "d": "M8 18h8"
        }
      ],
      [
        "path",
        {
          "d": "M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"
        }
      ],
      [
        "path",
        {
          "d": "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        }
      ]
    ]
  },
  {
    "id": "lucide-bed",
    "title": "小床",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "bed",
    "sourceUrl": "https://lucide.dev/icons/bed",
    "nodes": [
      [
        "path",
        {
          "d": "M2 4v16"
        }
      ],
      [
        "path",
        {
          "d": "M2 8h18a2 2 0 0 1 2 2v10"
        }
      ],
      [
        "path",
        {
          "d": "M2 17h20"
        }
      ],
      [
        "path",
        {
          "d": "M6 8v9"
        }
      ]
    ]
  },
  {
    "id": "lucide-lamp-desk",
    "title": "台灯",
    "category": "生活用品",
    "difficulty": "medium",
    "accent": "#4f9565",
    "sourceName": "lamp-desk",
    "sourceUrl": "https://lucide.dev/icons/lamp-desk",
    "nodes": [
      [
        "path",
        {
          "d": "m14 5-3 3 2 7 8-8-7-2Z"
        }
      ],
      [
        "path",
        {
          "d": "m14 5-3 3-3-3 3-3 3 3Z"
        }
      ],
      [
        "path",
        {
          "d": "M9.5 6.5 4 12l3 6"
        }
      ],
      [
        "path",
        {
          "d": "M3 22v-2c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2H3Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-sofa",
    "title": "沙发",
    "category": "生活用品",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "sofa",
    "sourceUrl": "https://lucide.dev/icons/sofa",
    "nodes": [
      [
        "path",
        {
          "d": "M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"
        }
      ],
      [
        "path",
        {
          "d": "M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"
        }
      ],
      [
        "path",
        {
          "d": "M4 18v2"
        }
      ],
      [
        "path",
        {
          "d": "M20 18v2"
        }
      ],
      [
        "path",
        {
          "d": "M12 4v9"
        }
      ]
    ]
  },
  {
    "id": "lucide-armchair",
    "title": "扶手椅",
    "category": "生活用品",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "armchair",
    "sourceUrl": "https://lucide.dev/icons/armchair",
    "nodes": [
      [
        "path",
        {
          "d": "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"
        }
      ],
      [
        "path",
        {
          "d": "M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"
        }
      ],
      [
        "path",
        {
          "d": "M5 18v2"
        }
      ],
      [
        "path",
        {
          "d": "M19 18v2"
        }
      ]
    ]
  },
  {
    "id": "lucide-camera",
    "title": "照相机",
    "category": "生活用品",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "camera",
    "sourceUrl": "https://lucide.dev/icons/camera",
    "nodes": [
      [
        "path",
        {
          "d": "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "13",
          "r": "3"
        }
      ]
    ]
  },
  {
    "id": "lucide-palette",
    "title": "调色盘",
    "category": "艺术与游戏",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "palette",
    "sourceUrl": "https://lucide.dev/icons/palette",
    "nodes": [
      [
        "circle",
        {
          "cx": "13.5",
          "cy": "6.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      [
        "circle",
        {
          "cx": "17.5",
          "cy": "10.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      [
        "circle",
        {
          "cx": "8.5",
          "cy": "7.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      [
        "circle",
        {
          "cx": "6.5",
          "cy": "12.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ],
      [
        "path",
        {
          "d": "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
        }
      ]
    ]
  },
  {
    "id": "lucide-music",
    "title": "音符",
    "category": "艺术与游戏",
    "difficulty": "easy",
    "accent": "#d45d6c",
    "sourceName": "music",
    "sourceUrl": "https://lucide.dev/icons/music",
    "nodes": [
      [
        "path",
        {
          "d": "M9 18V5l12-2v13"
        }
      ],
      [
        "circle",
        {
          "cx": "6",
          "cy": "18",
          "r": "3"
        }
      ],
      [
        "circle",
        {
          "cx": "18",
          "cy": "16",
          "r": "3"
        }
      ]
    ]
  },
  {
    "id": "lucide-drum",
    "title": "小鼓",
    "category": "艺术与游戏",
    "difficulty": "medium",
    "accent": "#268fa5",
    "sourceName": "drum",
    "sourceUrl": "https://lucide.dev/icons/drum",
    "nodes": [
      [
        "path",
        {
          "d": "m2 2 8 8"
        }
      ],
      [
        "path",
        {
          "d": "m22 2-8 8"
        }
      ],
      [
        "ellipse",
        {
          "cx": "12",
          "cy": "9",
          "rx": "10",
          "ry": "5"
        }
      ],
      [
        "path",
        {
          "d": "M7 13.4v7.9"
        }
      ],
      [
        "path",
        {
          "d": "M12 14v8"
        }
      ],
      [
        "path",
        {
          "d": "M17 13.4v7.9"
        }
      ],
      [
        "path",
        {
          "d": "M2 9v8a10 5 0 0 0 20 0V9"
        }
      ]
    ]
  },
  {
    "id": "lucide-guitar",
    "title": "吉他",
    "category": "艺术与游戏",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "guitar",
    "sourceUrl": "https://lucide.dev/icons/guitar",
    "nodes": [
      [
        "path",
        {
          "d": "m11.9 12.1 4.514-4.514"
        }
      ],
      [
        "path",
        {
          "d": "M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z"
        }
      ],
      [
        "path",
        {
          "d": "m6 16 2 2"
        }
      ],
      [
        "path",
        {
          "d": "M8.2 9.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.9 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4 2 2 0 0 0 1.8-1.2z"
        }
      ],
      [
        "circle",
        {
          "cx": "11.5",
          "cy": "12.5",
          "r": ".5",
          "fill": "currentColor"
        }
      ]
    ]
  },
  {
    "id": "lucide-piano",
    "title": "钢琴",
    "category": "艺术与游戏",
    "difficulty": "medium",
    "accent": "#8a63b8",
    "sourceName": "piano",
    "sourceUrl": "https://lucide.dev/icons/piano",
    "nodes": [
      [
        "path",
        {
          "d": "M18.5 8c-1.4 0-2.6-.8-3.2-2A6.87 6.87 0 0 0 2 9v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8.5C22 9.6 20.4 8 18.5 8"
        }
      ],
      [
        "path",
        {
          "d": "M2 14h20"
        }
      ],
      [
        "path",
        {
          "d": "M6 14v4"
        }
      ],
      [
        "path",
        {
          "d": "M10 14v4"
        }
      ],
      [
        "path",
        {
          "d": "M14 14v4"
        }
      ],
      [
        "path",
        {
          "d": "M18 14v4"
        }
      ]
    ]
  },
  {
    "id": "lucide-toy-brick",
    "title": "积木",
    "category": "艺术与游戏",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "toy-brick",
    "sourceUrl": "https://lucide.dev/icons/toy-brick",
    "nodes": [
      [
        "rect",
        {
          "width": "18",
          "height": "12",
          "x": "3",
          "y": "8",
          "rx": "1"
        }
      ],
      [
        "path",
        {
          "d": "M10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3"
        }
      ],
      [
        "path",
        {
          "d": "M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3"
        }
      ]
    ]
  },
  {
    "id": "lucide-puzzle",
    "title": "拼图",
    "category": "艺术与游戏",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "puzzle",
    "sourceUrl": "https://lucide.dev/icons/puzzle",
    "nodes": [
      [
        "path",
        {
          "d": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"
        }
      ]
    ]
  },
  {
    "id": "lucide-gamepad-2",
    "title": "游戏手柄",
    "category": "艺术与游戏",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "gamepad-2",
    "sourceUrl": "https://lucide.dev/icons/gamepad-2",
    "nodes": [
      [
        "line",
        {
          "x1": "6",
          "x2": "10",
          "y1": "11",
          "y2": "11"
        }
      ],
      [
        "line",
        {
          "x1": "8",
          "x2": "8",
          "y1": "9",
          "y2": "13"
        }
      ],
      [
        "line",
        {
          "x1": "15",
          "x2": "15.01",
          "y1": "12",
          "y2": "12"
        }
      ],
      [
        "line",
        {
          "x1": "18",
          "x2": "18.01",
          "y1": "10",
          "y2": "10"
        }
      ],
      [
        "path",
        {
          "d": "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"
        }
      ]
    ]
  },
  {
    "id": "lucide-volleyball",
    "title": "排球",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#c78332",
    "sourceName": "volleyball",
    "sourceUrl": "https://lucide.dev/icons/volleyball",
    "nodes": [
      [
        "path",
        {
          "d": "M11.1 7.1a16.55 16.55 0 0 1 10.9 4"
        }
      ],
      [
        "path",
        {
          "d": "M12 12a12.6 12.6 0 0 1-8.7 5"
        }
      ],
      [
        "path",
        {
          "d": "M16.8 13.6a16.55 16.55 0 0 1-9 7.5"
        }
      ],
      [
        "path",
        {
          "d": "M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10"
        }
      ],
      [
        "path",
        {
          "d": "M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ]
    ]
  },
  {
    "id": "lucide-dumbbell",
    "title": "哑铃",
    "category": "运动与成长",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "dumbbell",
    "sourceUrl": "https://lucide.dev/icons/dumbbell",
    "nodes": [
      [
        "path",
        {
          "d": "M14.4 14.4 9.6 9.6"
        }
      ],
      [
        "path",
        {
          "d": "M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"
        }
      ],
      [
        "path",
        {
          "d": "m21.5 21.5-1.4-1.4"
        }
      ],
      [
        "path",
        {
          "d": "M3.9 3.9 2.5 2.5"
        }
      ],
      [
        "path",
        {
          "d": "M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"
        }
      ]
    ]
  },
  {
    "id": "lucide-medal",
    "title": "奖牌",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "medal",
    "sourceUrl": "https://lucide.dev/icons/medal",
    "nodes": [
      [
        "path",
        {
          "d": "M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"
        }
      ],
      [
        "path",
        {
          "d": "M11 12 5.12 2.2"
        }
      ],
      [
        "path",
        {
          "d": "m13 12 5.88-9.8"
        }
      ],
      [
        "path",
        {
          "d": "M8 7h8"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "17",
          "r": "5"
        }
      ],
      [
        "path",
        {
          "d": "M12 18v-2h-.5"
        }
      ]
    ]
  },
  {
    "id": "lucide-trophy",
    "title": "奖杯",
    "category": "运动与成长",
    "difficulty": "medium",
    "accent": "#5a7fd1",
    "sourceName": "trophy",
    "sourceUrl": "https://lucide.dev/icons/trophy",
    "nodes": [
      [
        "path",
        {
          "d": "M6 9H4.5a2.5 2.5 0 0 1 0-5H6"
        }
      ],
      [
        "path",
        {
          "d": "M18 9h1.5a2.5 2.5 0 0 0 0-5H18"
        }
      ],
      [
        "path",
        {
          "d": "M4 22h16"
        }
      ],
      [
        "path",
        {
          "d": "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"
        }
      ],
      [
        "path",
        {
          "d": "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"
        }
      ],
      [
        "path",
        {
          "d": "M18 2H6v7a6 6 0 0 0 12 0V2Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-heart",
    "title": "爱心",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "heart",
    "sourceUrl": "https://lucide.dev/icons/heart",
    "nodes": [
      [
        "path",
        {
          "d": "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        }
      ]
    ]
  },
  {
    "id": "lucide-smile",
    "title": "笑脸",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "smile",
    "sourceUrl": "https://lucide.dev/icons/smile",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M8 14s1.5 2 4 2 4-2 4-2"
        }
      ],
      [
        "line",
        {
          "x1": "9",
          "x2": "9.01",
          "y1": "9",
          "y2": "9"
        }
      ],
      [
        "line",
        {
          "x1": "15",
          "x2": "15.01",
          "y1": "9",
          "y2": "9"
        }
      ]
    ]
  },
  {
    "id": "lucide-laugh",
    "title": "大笑脸",
    "category": "运动与成长",
    "difficulty": "medium",
    "accent": "#c78332",
    "sourceName": "laugh",
    "sourceUrl": "https://lucide.dev/icons/laugh",
    "nodes": [
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "10"
        }
      ],
      [
        "path",
        {
          "d": "M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z"
        }
      ],
      [
        "line",
        {
          "x1": "9",
          "x2": "9.01",
          "y1": "9",
          "y2": "9"
        }
      ],
      [
        "line",
        {
          "x1": "15",
          "x2": "15.01",
          "y1": "9",
          "y2": "9"
        }
      ]
    ]
  },
  {
    "id": "lucide-baby",
    "title": "小宝宝",
    "category": "运动与成长",
    "difficulty": "medium",
    "accent": "#d45d6c",
    "sourceName": "baby",
    "sourceUrl": "https://lucide.dev/icons/baby",
    "nodes": [
      [
        "path",
        {
          "d": "M9 12h.01"
        }
      ],
      [
        "path",
        {
          "d": "M15 12h.01"
        }
      ],
      [
        "path",
        {
          "d": "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"
        }
      ],
      [
        "path",
        {
          "d": "M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"
        }
      ]
    ]
  },
  {
    "id": "lucide-footprints",
    "title": "脚印",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#268fa5",
    "sourceName": "footprints",
    "sourceUrl": "https://lucide.dev/icons/footprints",
    "nodes": [
      [
        "path",
        {
          "d": "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"
        }
      ],
      [
        "path",
        {
          "d": "M16 17h4"
        }
      ],
      [
        "path",
        {
          "d": "M4 13h4"
        }
      ]
    ]
  },
  {
    "id": "lucide-hand",
    "title": "小手",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#5a7fd1",
    "sourceName": "hand",
    "sourceUrl": "https://lucide.dev/icons/hand",
    "nodes": [
      [
        "path",
        {
          "d": "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"
        }
      ],
      [
        "path",
        {
          "d": "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"
        }
      ],
      [
        "path",
        {
          "d": "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"
        }
      ],
      [
        "path",
        {
          "d": "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
        }
      ]
    ]
  },
  {
    "id": "lucide-eye",
    "title": "眼睛",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#8a63b8",
    "sourceName": "eye",
    "sourceUrl": "https://lucide.dev/icons/eye",
    "nodes": [
      [
        "path",
        {
          "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        }
      ],
      [
        "circle",
        {
          "cx": "12",
          "cy": "12",
          "r": "3"
        }
      ]
    ]
  },
  {
    "id": "lucide-ear",
    "title": "耳朵",
    "category": "运动与成长",
    "difficulty": "easy",
    "accent": "#4f9565",
    "sourceName": "ear",
    "sourceUrl": "https://lucide.dev/icons/ear",
    "nodes": [
      [
        "path",
        {
          "d": "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"
        }
      ],
      [
        "path",
        {
          "d": "M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"
        }
      ]
    ]
  }
] as const satisfies readonly ArtTraceSource[]
