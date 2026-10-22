export default function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      {title && <div className="empty-state-title">{title}</div>}
      {message && <div className="empty-state-msg">{message}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
