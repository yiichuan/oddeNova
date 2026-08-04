import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { EditIcon } from './icons';

interface EditableSessionTitleProps {
  title: string;
  canEdit: boolean;
  className?: string;
  inputClassName?: string;
  titleTextClassName?: string;
  onRename: (title: string) => void;
}

export default function EditableSessionTitle({
  title,
  canEdit,
  className = '',
  inputClassName = '',
  titleTextClassName = '',
  onRename,
}: EditableSessionTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const displayTitle = title || t('newSessionTitle');
  const sizingText = displayTitle;

  const save = () => {
    const nextTitle = draft.trim();
    setIsEditing(false);
    if (!nextTitle || nextTitle === title) return;
    onRename(nextTitle);
  };

  const cancel = () => {
    cancelRef.current = true;
    setDraft(title);
    setIsEditing(false);
  };

  if (!canEdit) {
    return (
      <span className={titleTextClassName} title={displayTitle}>
        {displayTitle}
      </span>
    );
  }

  return (
    <div className={className}>
      <div
        data-session-title-shell
        data-editing={isEditing}
        className={`group/title relative grid h-8 w-fit overflow-hidden rounded-[6px] border transition-[background-color,border-color] duration-150 ${
          isEditing
            ? 'border-border bg-[#1a1a1a]'
            : 'border-transparent hover:bg-[#1a1a1a]'
        }`}
        style={{ maxWidth: 'calc(100% - 16px)' }}
      >
        {/* Invisible copy owns intrinsic width in both modes. Keeping it in the
            same grid cell as the control prevents the input swap from moving
            the title or the actions beside it. */}
        <span
          aria-hidden="true"
          className={`invisible col-start-1 row-start-1 h-8 min-w-0 max-w-full whitespace-pre px-2 pr-7 leading-8 ${titleTextClassName}`}
        >
          {sizingText}
        </span>

        {isEditing ? (
          <input
            ref={inputRef}
            aria-label="Edit session title"
            value={draft}
            maxLength={60}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={() => {
              if (cancelRef.current) {
                cancelRef.current = false;
                return;
              }
              save();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            className={`absolute inset-0 h-8 min-w-0 w-full border-0 bg-transparent px-2 py-[6px] pr-7 leading-5 outline-none ${inputClassName}`}
            style={{ lineHeight: '20px' }}
          />
        ) : (
          <button
            type="button"
            data-session-title-edit
            className="absolute inset-0 flex h-8 min-w-0 w-full items-center px-2 pr-7 text-left"
            title={displayTitle}
            onClick={(e) => {
              e.stopPropagation();
              cancelRef.current = false;
              setDraft(displayTitle);
              setIsEditing(true);
            }}
          >
            <span className={`min-w-0 truncate ${titleTextClassName}`}>{displayTitle}</span>
          </button>
        )}

        {!isEditing && (
          <span
            data-session-title-edit-icon
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted opacity-0 transition-opacity duration-150 group-hover/title:opacity-100"
          >
            <EditIcon size={12} />
          </span>
        )}
      </div>
    </div>
  );
}
