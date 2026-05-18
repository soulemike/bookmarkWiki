declare namespace chrome {
  namespace bookmarks {
    interface BookmarkTreeNode { id: string; parentId?: string; index?: number; url?: string; title: string; children?: BookmarkTreeNode[] }
    function getTree(): Promise<BookmarkTreeNode[]>;
    function getChildren(id: string): Promise<BookmarkTreeNode[]>;
    function create(bookmark: { parentId?: string; title?: string; url?: string }): Promise<BookmarkTreeNode>;
    function move(id: string, destination: { parentId?: string; index?: number }): Promise<BookmarkTreeNode>;
    function update(id: string, changes: { title?: string; url?: string }): Promise<BookmarkTreeNode>;
    function get(id: string): Promise<BookmarkTreeNode[]>;
    const onCreated: ChromeEvent<(id: string, node: BookmarkTreeNode) => void>;
    const onRemoved: ChromeEvent<(...args: unknown[]) => void>;
    const onChanged: ChromeEvent<(...args: unknown[]) => void>;
    interface BookmarkMoveInfo { parentId?: string; index?: number; oldParentId?: string; oldIndex?: number }
    const onMoved: ChromeEvent<(id: string, moveInfo: BookmarkMoveInfo) => void>;
    const onChildrenReordered: ChromeEvent<(...args: unknown[]) => void>;
  }
  namespace storage {
    const local: { get(key?: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
  }
  namespace tabs { interface Tab { id?: number; windowId: number; url?: string; title?: string } }
  namespace runtime {
    const onInstalled: ChromeEvent<() => void>;
    const onStartup: ChromeEvent<() => void>;
    const onMessage: ChromeEvent<(message: any, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void>;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
  }
  namespace action { const onClicked: ChromeEvent<(tab: tabs.Tab) => void>; }
  namespace contextMenus {
    interface OnClickData { menuItemId: string | number; linkUrl?: string; selectionText?: string }
    function create(createProperties: { id: string; title: string; contexts: string[] }): void;
    const onClicked: ChromeEvent<(info: OnClickData) => void>;
  }
  namespace alarms {
    interface Alarm { name: string }
    function create(name: string, alarmInfo: { periodInMinutes: number }): void;
    const onAlarm: ChromeEvent<(alarm: Alarm) => void>;
  }
  namespace sidePanel { function open(options: { windowId: number }): Promise<void>; }
}
interface ChromeEvent<T extends (...args: any[]) => any> { addListener(callback: T): void }
