(function () {
  const RESOURCE_LINKS = [
    {
      title: "Stripe Training",
      description:
        "Interactive courses on Stripe products, including a module on Radar and fraud prevention.",
      href: "https://www.stripe.training/"
    },
    {
      title: "Radar overview",
      description:
        "High-level guidance on Stripe Radar, machine learning signals, and custom rules.",
      href: "https://docs.stripe.com/radar"
    },
    {
      title: "Radar rules reference",
      description:
        "Rule syntax, supported attributes, and examples for custom Radar rules.",
      href: "https://docs.stripe.com/radar/rules/reference"
    },
    {
      title: "Fraud prevention best practices",
      description:
        "Broader guidance for reducing fraud and managing payment risk.",
      href: "https://docs.stripe.com/disputes/prevention"
    }
  ];

  const DEMO_PAYLOAD = {
    rules: [
      {
        id: "demo-1",
        rule: ":amount_in_usd: < 15 and :risk_level: = 'normal'",
        description: "Allow low-value transactions when the overall risk is normal.",
        category: "Low-value transactions",
        type: "allow",
        reference: "https://docs.stripe.com/radar/rules",
        owner: "Fraud Ops",
        enabled: true,
        lastReviewed: "2026-02-14"
      },
      {
        id: "demo-2",
        rule: ":card_country: != :ip_country: and :risk_level: = 'highest'",
        description: "Deny charges with a country mismatch and the highest risk level.",
        category: "Geo mismatch",
        type: "deny",
        reference: "https://docs.stripe.com/radar/rules",
        severity: "high"
      },
      {
        id: "demo-3",
        rule: ":email_count_for_card_all_time: > 3",
        description: "Review transactions where the same card appears across many emails.",
        category: "Identity signals",
        type: "review",
        reference: "https://docs.stripe.com/radar/rules",
        queue: "Manual review"
      },
      {
        id: "demo-4",
        rule: ":is_proxy: = true",
        description: "Review traffic from proxy or anonymized IPs.",
        category: "Network signals",
        type: "review",
        reference: "https://docs.stripe.com/radar/rules",
        queue: "Network checks"
      }
    ]
  };

  const KNOWN_FIELDS = new Set([
    "id",
    "rule",
    "description",
    "category",
    "type",
    "reference"
  ]);

  const state = {
    rules: [],
    source: "loading",
    notice: "",
    loading: true,
    selectedCategories: [],
    selectedTypes: [],
    searchTerm: "",
    categoryQuery: "",
    categoryMenuOpen: false,
    resourcesOpen: false
  };

  const els = {
    noticeBanner: document.getElementById("notice-banner"),
    categoryTrigger: document.getElementById("category-trigger"),
    categorySummary: document.getElementById("category-summary"),
    categoryPanel: document.getElementById("category-panel"),
    categoryFilterInput: document.getElementById("category-filter-input"),
    categoryOptions: document.getElementById("category-options"),
    clearCategoriesButton: document.getElementById("clear-categories-button"),
    searchInput: document.getElementById("search-input"),
    typeFilters: document.getElementById("type-filters"),
    statsText: document.getElementById("stats-text"),
    activeFilters: document.getElementById("active-filters"),
    rulesGrid: document.getElementById("rules-grid"),
    resetFiltersButton: document.getElementById("reset-filters-button"),
    openResourcesButton: document.getElementById("open-resources-button"),
    resourcesModal: document.getElementById("resources-modal"),
    resourcesBackdrop: document.getElementById("resources-backdrop"),
    closeResourcesButton: document.getElementById("close-resources-button"),
    resourcesGrid: document.getElementById("resources-grid"),
    categorySelect: document.getElementById("category-select")
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stringifyValue(value) {
    if (value === null || value === undefined) {
      return "—";
    }

    if (typeof value === "string") {
      return value || "—";
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map(stringifyValue).join(", ");
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return "[Object]";
      }
    }

    return String(value);
  }

  function prettifyKey(key) {
    return String(key)
      .replace(/([a-z0-9])([A-Z])/g, "\$1 \$2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
  }

  function isUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function normalizeRules(payload) {
    const rawRules = Array.isArray(payload)
      ? payload
      : Array.isArray(payload && payload.rules)
      ? payload.rules
      : [];

    return rawRules
      .filter(function (item) {
        return item && typeof item === "object" && !Array.isArray(item);
      })
      .map(function (item, index) {
        const extraMetadata = {};
        Object.keys(item).forEach(function (key) {
          if (!KNOWN_FIELDS.has(key)) {
            extraMetadata[key] = item[key];
          }
        });

        const rule = String(item.rule || ("Untitled rule " + (index + 1)));
        const description = String(item.description || "");
        const category = String(item.category || "Uncategorized");
        const type = String(item.type || "other").toLowerCase();
        const reference = String(item.reference || "");

        const metadataSearch = Object.keys(extraMetadata)
          .map(function (key) {
            return key + " " + stringifyValue(extraMetadata[key]);
          })
          .join(" ");

        return {
          id: item.id || (rule + "-" + category + "-" + index),
          rule: rule,
          description: description,
          category: category,
          type: type,
          reference: reference,
          extraMetadata: extraMetadata,
          searchIndex: (
            rule +
            " " +
            description +
            " " +
            category +
            " " +
            type +
            " " +
            reference +
            " " +
            metadataSearch
          ).toLowerCase()
        };
      });
  }

  function fallbackResult(message) {
    return {
      rules: normalizeRules(DEMO_PAYLOAD),
      source: "demo",
      notice: message
    };
  }

  async function loadRulesFromJson(path) {
    try {
      const response = await fetch(path, {
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        return fallbackResult(
          "Couldn't find `rules.json`, so the page is showing bundled demo data instead."
        );
      }

      const text = await response.text();
      const trimmed = text.trim();

      if (!trimmed) {
        return fallbackResult(
          "`rules.json` is empty, so the page is showing bundled demo data instead."
        );
      }

      if (trimmed.charAt(0) === "<") {
        return fallbackResult(
          "The app received HTML instead of JSON for `rules.json`. This usually means the file is missing or the page is being served incorrectly. Showing bundled demo data instead."
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        return fallbackResult(
          "`rules.json` couldn't be parsed. Please check the file for invalid JSON syntax. Showing bundled demo data instead."
        );
      }

      const normalized = normalizeRules(parsed);

      if (normalized.length === 0) {
        return fallbackResult(
          "`rules.json` loaded successfully, but no valid rule entries were found. Showing bundled demo data instead."
        );
      }

      return {
        rules: normalized,
        source: "file",
        notice: ""
      };
    } catch (error) {
      const fileProtocol = window.location.protocol === "file:";
      return fallbackResult(
        fileProtocol
          ? "This page was opened directly from your file system, so the browser likely blocked loading `rules.json`. Showing bundled demo data instead."
          : "The app couldn't reach `rules.json`. Showing bundled demo data instead."
      );
    }
  }

  function getCategories() {
    const map = {};
    state.rules.forEach(function (rule) {
      map[rule.category] = true;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function getTypes() {
    const map = {};
    state.rules.forEach(function (rule) {
      map[rule.type] = true;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function getTypeLabel(type) {
    const value = String(type || "").toLowerCase();
    if (value === "allow") return "Allow";
    if (value === "deny") return "Deny";
    if (value === "block") return "Block";
    if (value === "review") return "Review";
    return type || "Other";
  }

  function getTypeClass(type) {
    const value = String(type || "").toLowerCase();
    if (value === "allow") return "allow";
    if (value === "deny") return "deny";
    if (value === "block") return "block";
    if (value === "review") return "review";
    return "other";
  }

  function getFilteredRules() {
    const query = state.searchTerm.trim().toLowerCase();

    return state.rules.filter(function (item) {
      const matchesCategory =
        state.selectedCategories.length === 0 ||
        state.selectedCategories.indexOf(item.category) !== -1;

      const matchesType =
        state.selectedTypes.length === 0 ||
        state.selectedTypes.indexOf(item.type) !== -1;

      const matchesSearch =
        query.length === 0 || item.searchIndex.indexOf(query) !== -1;

      return matchesCategory && matchesType && matchesSearch;
    });
  }

  function updateCategorySummary() {
    if (state.selectedCategories.length === 0) {
      els.categorySummary.textContent = "All categories";
      return;
    }

    if (state.selectedCategories.length <= 2) {
      els.categorySummary.textContent = state.selectedCategories.join(", ");
      return;
    }

    els.categorySummary.textContent =
      state.selectedCategories.length + " categories selected";
  }

  function renderNotice() {
    if (!state.notice) {
      els.noticeBanner.classList.add("hidden");
      els.noticeBanner.innerHTML = "";
      return;
    }

    els.noticeBanner.classList.remove("hidden");
    els.noticeBanner.innerHTML =
      '<div class="notice-banner-title">Using demo data</div>' +
      '<div>' + escapeHtml(state.notice) + "</div>";
  }

  function renderCategoryOptions() {
    const categories = getCategories();
    const query = state.categoryQuery.trim().toLowerCase();

    const filteredCategories = categories.filter(function (category) {
      return category.toLowerCase().indexOf(query) !== -1;
    });

    if (filteredCategories.length === 0) {
      els.categoryOptions.innerHTML =
        '<div class="category-empty">No categories found.</div>';
      return;
    }

    els.categoryOptions.innerHTML = filteredCategories
      .map(function (category) {
        const selected = state.selectedCategories.indexOf(category) !== -1;
        return (
          '<button class="category-option' +
          (selected ? " is-selected" : "") +
          '" type="button" data-category="' +
          escapeHtml(category) +
          '">' +
          '<span class="category-option-checkbox">' +
          (selected ? "✓" : "") +
          "</span>" +
          '<span>' +
          escapeHtml(category) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderTypeFilters() {
    const types = getTypes();

    if (types.length === 0) {
      els.typeFilters.innerHTML = '<div class="type-empty">No types found</div>';
      return;
    }

    els.typeFilters.innerHTML = types
      .map(function (type) {
        const typeClass = getTypeClass(type);
        const isActive = state.selectedTypes.indexOf(type) !== -1;
        return (
          '<button class="type-chip ' +
          typeClass +
          (isActive ? " is-active" : "") +
          '" type="button" data-type="' +
          escapeHtml(type) +
          '">' +
          '<span class="type-dot"></span>' +
          '<span>' +
          escapeHtml(getTypeLabel(type)) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderActiveFilters() {
    const parts = [];

    state.selectedCategories.forEach(function (category) {
      parts.push(
        '<span class="filter-chip category">' +
          escapeHtml(category) +
          '<button class="filter-chip-remove" type="button" data-remove-category="' +
          escapeHtml(category) +
          '" aria-label="Remove ' +
          escapeHtml(category) +
          '">×</button>' +
        "</span>"
      );
    });

    state.selectedTypes.forEach(function (type) {
      parts.push(
        '<span class="filter-chip">' +
          "Type: " +
          escapeHtml(getTypeLabel(type)) +
          '<button class="filter-chip-remove" type="button" data-remove-type="' +
          escapeHtml(type) +
          '" aria-label="Remove ' +
          escapeHtml(type) +
          '">×</button>' +
        "</span>"
      );
    });

    els.activeFilters.innerHTML = parts.join("");
  }

  function renderStats(filteredRules) {
    els.statsText.innerHTML =
      "Showing <strong>" +
      filteredRules.length +
      "</strong> of <strong>" +
      state.rules.length +
      "</strong> rules" +
      (state.source === "file" ? "" : " (demo data)");
  }

  function renderLoadingState() {
    els.rulesGrid.innerHTML =
      '<div class="loading-skeleton-grid">' +
      '<div class="loading-skeleton"></div>' +
      '<div class="loading-skeleton"></div>' +
      '<div class="loading-skeleton"></div>' +
      "</div>";
  }

  function renderEmptyState() {
    els.rulesGrid.innerHTML =
      '<div class="empty-state">' +
      "<h3>No matching rules</h3>" +
      "<p>Try changing your category filters, type filters, or search text.</p>" +
      "</div>";
  }

  function buildMetadataRow(label, value, fullWidth) {
    const stringValue = stringifyValue(value);
    const content = isUrl(stringValue)
      ? '<a href="' +
        escapeHtml(stringValue) +
        '" target="_blank" rel="noreferrer">' +
        escapeHtml(stringValue) +
        "</a>"
      : escapeHtml(stringValue);

    return (
      '<div class="meta-item' +
      (fullWidth ? " meta-full" : "") +
      '">' +
      "<dt>" +
      escapeHtml(label) +
      "</dt>" +
      "<dd>" +
      content +
      "</dd>" +
      "</div>"
    );
  }

  function renderRuleCard(item) {
    const typeClass = getTypeClass(item.type);
    const typeLabel = getTypeLabel(item.type);
    const metadata = [
      buildMetadataRow("Category", item.category, false),
      buildMetadataRow("Type", typeLabel, false),
      buildMetadataRow("Reference", item.reference || "—", true)
    ];

    Object.keys(item.extraMetadata || {}).forEach(function (key) {
      metadata.push(
        buildMetadataRow(prettifyKey(key), item.extraMetadata[key], false)
      );
    });

    return (
      '<article class="rule-card type-' +
        escapeHtml(typeClass) +
        '">' +
        '<div class="rule-card-header">' +
          '<div class="badge-group">' +
            '<span class="rule-badge type-' +
              escapeHtml(typeClass) +
              '">' +
              '<span class="rule-badge-dot"></span>' +
              escapeHtml(typeLabel) +
            "</span>" +
            '<span class="rule-badge category-badge">' +
              escapeHtml(item.category) +
            "</span>" +
          "</div>" +
        "</div>" +
        '<div class="rule-code"><code>' + escapeHtml(item.rule) + "</code></div>" +
        '<div class="rule-description">' +
          escapeHtml(item.description || "No description provided.") +
        "</div>" +
        '<dl class="rule-meta">' + metadata.join("") + "</dl>" +
      "</article>"
    );
  }

  function renderRulesGrid() {
    if (state.loading) {
      renderLoadingState();
      return;
    }

    const filteredRules = getFilteredRules();
    renderStats(filteredRules);

    if (filteredRules.length === 0) {
      renderEmptyState();
      return;
    }

    els.rulesGrid.innerHTML = filteredRules.map(renderRuleCard).join("");
  }

  function setVersioninHeader() {
    // Fetch version number from state and set it in .hero-badge header
    const versionElement = document.querySelector(".version-number");
    if (versionElement) {
      versionElement.textContent = "v" + state.version;
    }
  }

  function renderResources() {
    els.resourcesGrid.innerHTML = RESOURCE_LINKS.map(function (resource) {
      return (
        '<a class="resource-card" href="' +
        escapeHtml(resource.href) +
        '" target="_blank" rel="noreferrer">' +
          '<h3 class="resource-title">' + escapeHtml(resource.title) + "</h3>" +
          '<p class="resource-description">' + escapeHtml(resource.description) + "</p>" +
        "</a>"
      );
    }).join("");
  }

  function setCategoryMenuOpen(open) {
    state.categoryMenuOpen = open;
    els.categoryPanel.classList.toggle("hidden", !open);
    els.categoryTrigger.setAttribute("aria-expanded", open ? "true" : "false");

    if (open) {
      setTimeout(function () {
        els.categoryFilterInput.focus();
      }, 0);
    }
  }

  function setResourcesOpen(open) {
    state.resourcesOpen = open;
    els.resourcesModal.classList.toggle("hidden", !open);
    els.resourcesModal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function resetFilters() {
    state.selectedCategories = [];
    state.selectedTypes = [];
    state.searchTerm = "";
    state.categoryQuery = "";
    els.searchInput.value = "";
    els.categoryFilterInput.value = "";
    render();
  }

  function toggleCategory(category) {
    const index = state.selectedCategories.indexOf(category);

    if (index === -1) {
      state.selectedCategories = state.selectedCategories.concat(category);
    } else {
      state.selectedCategories = state.selectedCategories.filter(function (item) {
        return item !== category;
      });
    }

    render();
  }

  function toggleType(type) {
    const index = state.selectedTypes.indexOf(type);

    if (index === -1) {
      state.selectedTypes = state.selectedTypes.concat(type);
    } else {
      state.selectedTypes = state.selectedTypes.filter(function (item) {
        return item !== type;
      });
    }

    render();
  }

  function render() {
    updateCategorySummary();
    renderNotice();
    renderCategoryOptions();
    renderTypeFilters();
    renderActiveFilters();
    renderRulesGrid();
    renderResources();
    setVersioninHeader();
  }

  async function init() {
    bindEvents();
    renderLoadingState();

    const result = await loadRulesFromJson("rules.json");
    state.rules = result.rules;
    state.source = result.source;
    state.notice = result.notice;
    state.version = '0.0.5'; // Update this version number as needed
    state.loading = false;
    render();
  }

  function bindEvents() {
    els.resetFiltersButton.addEventListener("click", function () {
      resetFilters();
    });

    els.searchInput.addEventListener("input", function (event) {
      state.searchTerm = event.target.value || "";
      renderRulesGrid();
      renderStats(getFilteredRules());
      renderActiveFilters();
    });

    els.categoryTrigger.addEventListener("click", function () {
      setCategoryMenuOpen(!state.categoryMenuOpen);
    });

    els.clearCategoriesButton.addEventListener("click", function () {
      state.selectedCategories = [];
      render();
    });

    els.categoryFilterInput.addEventListener("input", function (event) {
      state.categoryQuery = event.target.value || "";
      renderCategoryOptions();
    });

    els.categoryOptions.addEventListener("click", function (event) {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      toggleCategory(button.getAttribute("data-category"));
    });

    els.typeFilters.addEventListener("click", function (event) {
      const button = event.target.closest("[data-type]");
      if (!button) return;
      toggleType(button.getAttribute("data-type"));
    });

    els.activeFilters.addEventListener("click", function (event) {
      const removeCategory = event.target.closest("[data-remove-category]");
      if (removeCategory) {
        const category = removeCategory.getAttribute("data-remove-category");
        state.selectedCategories = state.selectedCategories.filter(function (item) {
          return item !== category;
        });
        render();
        return;
      }

      const removeType = event.target.closest("[data-remove-type]");
      if (removeType) {
        const type = removeType.getAttribute("data-remove-type");
        state.selectedTypes = state.selectedTypes.filter(function (item) {
          return item !== type;
        });
        render();
      }
    });

    els.openResourcesButton.addEventListener("click", function () {
      setResourcesOpen(true);
    });

    els.closeResourcesButton.addEventListener("click", function () {
      setResourcesOpen(false);
    });

    els.resourcesBackdrop.addEventListener("click", function () {
      setResourcesOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (!state.categoryMenuOpen) return;
      if (!els.categorySelect.contains(event.target)) {
        setCategoryMenuOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (state.categoryMenuOpen) {
          setCategoryMenuOpen(false);
        }
        if (state.resourcesOpen) {
          setResourcesOpen(false);
        }
      }
    });
  }

  init();
})();