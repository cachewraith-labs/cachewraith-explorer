import { MenuList } from '@/shared/ui/MenuList';
import { Popover } from '@/shared/ui/Popover';

import { useContextMenu } from './store';

export function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  return (
    <Popover open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} width={260} label="Context menu" onClose={close}>
      {menu && <MenuList key={`${menu.x},${menu.y}`} items={menu.items} onDone={close} />}
    </Popover>
  );
}
