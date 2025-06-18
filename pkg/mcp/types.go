package mcp

// MCPServer defines the structure for an MCP server configuration.
type MCPServer struct {
	// ID            string            `json:"id"`
	Name        string            `json:"name"`
	Type        *string           `json:"type,omitempty"`
	Description *string           `json:"description,omitempty"`
	BaseURL     *string           `json:"baseUrl,omitempty"`
	Command     *string           `json:"command,omitempty"`
	RegistryURL *string           `json:"registryUrl,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	// IsActive      bool              `json:"isActive"`
	DisabledTools []string          `json:"disabledTools,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	SearchKey     *string           `json:"searchKey,omitempty"`
	Provider      *string           `json:"provider,omitempty"`
	ProviderURL   *string           `json:"providerUrl,omitempty"`
	LogoURL       *string           `json:"logoUrl,omitempty"`
	Tags          []string          `json:"tags,omitempty"`
	Timeout       *int              `json:"timeout,omitempty"`
}
