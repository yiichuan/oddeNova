import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

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

  if (isEditing) {
    return (
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
        className={inputClassName}
      />
    );
  }

  return (
    <button
      type="button"
      data-session-title-edit
      className={className}
      title={displayTitle}
      onClick={(e) => {
        e.stopPropagation();
        cancelRef.current = false;
        setDraft(displayTitle);
        setIsEditing(true);
      }}
    >
      <span className={titleTextClassName}>{displayTitle}</span>
    </button>
  );
}
