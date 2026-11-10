// Work Object metadata for a PR. The card carries it; clicking it opens the review page in Slack's side panel.
export function entityFor(pr, previewUrl) {
  return {
    entity_type: 'slack#/entities/file',
    url: pr.html_url,
    external_ref: { id: `pr-${pr.number}`, type: 'pull_request' },
    entity_payload: {
      attributes: {
        title: { text: `#${pr.number} · ${pr.title}` },
        display_type: 'Salesforce change',
        product_name: 'Release Desk',
        metadata_last_modified: Math.floor(Date.now() / 1000),
        full_size_preview: { is_supported: true, mime_type: 'application/vnd.slack-embed', ...(previewUrl ? { preview_url: previewUrl } : {}) },
      },
      fields: {
        created_by: { user: { text: pr.user.login }, type: 'slack#/types/user' },
        date_created: { value: Math.floor(Date.parse(pr.created_at) / 1000) },
        date_updated: { value: Math.floor(Date.parse(pr.updated_at) / 1000) },
      },
    },
  };
}
