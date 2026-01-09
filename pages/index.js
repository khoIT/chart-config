import { useState, useCallback, useMemo } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, ChevronRight, 
  Filter, Database, Table, GitBranch, Info, X, RefreshCw,
  Plus, Trash2
} from 'lucide-react';

const AVAILABLE_FILTERS = [
  { id: 'filter_shop', name: 'Shop', sourceFilter: 'Shop', type: 'Multi select' },
  { id: 'filter_method', name: 'Method', sourceFilter: 'Method', type: 'Single select' },
  { id: 'filter_country', name: 'Country', sourceFilter: 'Country', type: 'Multi select' },
  { id: 'filter_date', name: 'Date Range', sourceFilter: 'Date', type: 'Date range' },
];

const INITIAL_STATE = {
  filters: {
    selected: ['filter_shop', 'filter_method'],
    sampleValues: {
      filter_shop: ['ios', 'android'],
      filter_method: ['credit_card'],
    },
    validated: true,
    lastValidated: Date.now(),
  },
  query: {
    statement: `SELECT
  sum(case when report_date = '{report_date}' then total_amount else 0 end) as current_gmv,
  sum(case when report_date = date_sub(toDate('{report_date}'), interval 1 day) then total_amount else 0 end) as previous_gmv
FROM billing_transactions
WHERE platform IN ({filter_shop})
  AND payment_method = '{filter_method}'
  AND gds_code = '{gds_code}'`,
    validated: true,
    lastValidated: Date.now(),
    usedFilters: ['filter_shop', 'filter_method'],
  },
  preview: {
    data: [
      { current_gmv: 40125600, previous_gmv: 80330000, compare_value: '50.1%', data_status: 0, last_update: '12:00' }
    ],
    columns: ['current_gmv', 'previous_gmv', 'compare_value', 'data_status', 'last_update'],
    validated: true,
    lastValidated: Date.now(),
  },
  mapping: {
    valueMapping: 'current_gmv',
    previousValueField: 'previous_gmv',
    compareValueField: 'compare_value',
    validated: true,
    lastValidated: Date.now(),
  }
};

const STATUS = {
  VALID: 'valid',
  NEEDS_UPDATE: 'needs_update',
  OUTDATED: 'outdated',
};

const StatusBadge = ({ status, onClick }) => {
  const config = {
    [STATUS.VALID]: { icon: CheckCircle2, text: 'Valid', className: 'bg-green-100 text-green-800' },
    [STATUS.NEEDS_UPDATE]: { icon: AlertTriangle, text: 'Needs Update', className: 'bg-amber-100 text-amber-800' },
    [STATUS.OUTDATED]: { icon: XCircle, text: 'Outdated', className: 'bg-red-100 text-red-800' },
  };
  const { icon: Icon, text, className } = config[status];
  
  return (
    <span 
      className={`status-badge ${className} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      <Icon size={14} />
      {text}
    </span>
  );
};

const Tooltip = ({ children, content, show }) => {
  if (!show || !content) return children;
  
  return (
    <div className="relative group">
      {children}
      <div className="tooltip hidden group-hover:block -top-2 left-full ml-2 whitespace-nowrap">
        {content}
      </div>
    </div>
  );
};

const SmartAssistBanner = ({ issues, onAction }) => {
  if (!issues || issues.length === 0) return null;
  
  return (
    <div className="space-y-2 mb-4">
      {issues.map((issue, idx) => (
        <div key={idx} className={issue.type === 'error' ? 'error-banner' : 'warning-banner'}>
          <AlertTriangle size={16} />
          <span className="flex-1">{issue.message}</span>
          <div className="flex gap-2">
            {issue.actions?.map((action, aidx) => (
              <button 
                key={aidx}
                onClick={() => onAction(action.action, action.payload)}
                className="px-2 py-1 text-xs font-medium bg-white rounded border hover:bg-slate-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const StepPanel = ({ steps, activeStep, onStepClick }) => {
  const icons = {
    filters: Filter,
    query: Database,
    preview: Table,
    mapping: GitBranch,
  };

  return (
    <div className="w-72 bg-white border-r border-slate-200 p-4 flex flex-col">
      <h2 className="text-lg font-semibold mb-4 text-slate-800">Configuration Steps</h2>
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const Icon = icons[step.id];
          const isActive = activeStep === step.id;
          
          return (
            <div
              key={step.id}
              className={`step-panel-item ${isActive ? 'active' : ''}`}
              onClick={() => onStepClick(step.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className="font-medium text-slate-800">
                    {idx + 1}. {step.name}
                  </div>
                  {step.invalidReason && (
                    <div className="text-xs text-amber-600 mt-0.5">
                      {step.invalidReason}
                    </div>
                  )}
                </div>
              </div>
              <StatusBadge status={step.status} />
            </div>
          );
        })}
      </div>
      
      <div className="mt-auto pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500 mb-2">Dependency Flow</div>
        <div className="flex items-center justify-center gap-1 text-slate-400 text-xs">
          <span className="px-2 py-1 bg-slate-100 rounded">Filters</span>
          <ChevronRight size={14} />
          <span className="px-2 py-1 bg-slate-100 rounded">Query</span>
          <ChevronRight size={14} />
          <span className="px-2 py-1 bg-slate-100 rounded">Preview</span>
          <ChevronRight size={14} />
          <span className="px-2 py-1 bg-slate-100 rounded">Mapping</span>
        </div>
      </div>
    </div>
  );
};

const FiltersEditor = ({ state, onChange, invalidatedBy }) => {
  const { selected, sampleValues } = state;
  
  const toggleFilter = (filterId) => {
    const newSelected = selected.includes(filterId)
      ? selected.filter(f => f !== filterId)
      : [...selected, filterId];
    
    const newSampleValues = { ...sampleValues };
    if (!newSelected.includes(filterId)) {
      delete newSampleValues[filterId];
    } else if (!newSampleValues[filterId]) {
      newSampleValues[filterId] = [];
    }
    
    onChange({
      ...state,
      selected: newSelected,
      sampleValues: newSampleValues,
      validated: true,
      lastValidated: Date.now(),
    });
  };

  const updateSampleValue = (filterId, values) => {
    onChange({
      ...state,
      sampleValues: {
        ...sampleValues,
        [filterId]: values,
      },
      validated: true,
      lastValidated: Date.now(),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">Available Filters</h3>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_FILTERS.map(filter => {
            const isSelected = selected.includes(filter.id);
            return (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={`px-3 py-2 rounded-lg border-2 transition-all ${
                  isSelected 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <CheckCircle2 size={16} className="text-blue-500" />
                  ) : (
                    <Plus size={16} className="text-slate-400" />
                  )}
                  <span className="font-medium">{filter.name}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{filter.type}</div>
              </button>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-3">Selected Filters & Sample Values</h3>
          <div className="space-y-4">
            {selected.map(filterId => {
              const filter = AVAILABLE_FILTERS.find(f => f.id === filterId);
              const values = sampleValues[filterId] || [];
              
              return (
                <div key={filterId} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-mono">
                        {filterId}
                      </code>
                      <span className="text-sm text-slate-500">
                        Source: {filter?.sourceFilter} | Type: {filter?.type}
                      </span>
                    </div>
                    <button 
                      onClick={() => toggleFilter(filterId)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {values.map((val, idx) => (
                      <span key={idx} className="filter-tag">
                        {val}
                        <button 
                          onClick={() => updateSampleValue(filterId, values.filter((_, i) => i !== idx))}
                          className="hover:text-red-600"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add value..."
                      className="px-2 py-1 border border-dashed border-slate-300 rounded text-sm w-32"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value) {
                          updateSampleValue(filterId, [...values, e.target.value]);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const QueryEditor = ({ state, onChange, filtersState, issues, onAction }) => {
  const { statement, usedFilters } = state;
  
  const highlightQuery = (query) => {
    const activeFilters = filtersState.selected;
    let highlighted = query;
    
    const filterPattern = /\{(filter_\w+)\}/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = filterPattern.exec(query)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: query.slice(lastIndex, match.index) });
      }
      
      const filterName = match[1];
      const isActive = activeFilters.includes(filterName);
      parts.push({ 
        type: 'filter', 
        content: match[0], 
        filterName,
        isActive,
        className: isActive ? 'query-highlight' : 'query-error-highlight'
      });
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < query.length) {
      parts.push({ type: 'text', content: query.slice(lastIndex) });
    }
    
    return parts;
  };

  const queryParts = highlightQuery(statement);

  return (
    <div className="space-y-4">
      <SmartAssistBanner issues={issues} onAction={onAction} />
      
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-700">
            Query Statement <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <span className="text-xs text-slate-500">
              Used filters: {usedFilters.map(f => (
                <code key={f} className={`mx-1 px-1 rounded ${
                  filtersState.selected.includes(f) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>{f}</code>
              ))}
            </span>
          </div>
        </div>
        
        <div className="relative">
          <div className="absolute inset-0 p-3 font-mono text-sm whitespace-pre-wrap pointer-events-none overflow-auto bg-slate-50 rounded-lg border border-slate-300">
            {queryParts.map((part, idx) => (
              part.type === 'filter' ? (
                <span key={idx} className={part.className} title={
                  part.isActive ? `Filter "${part.filterName}" is active` : `Filter "${part.filterName}" is NOT in selected filters!`
                }>
                  {part.content}
                </span>
              ) : (
                <span key={idx}>{part.content}</span>
              )
            ))}
          </div>
          <textarea
            value={statement}
            onChange={(e) => {
              const newStatement = e.target.value;
              const filterPattern = /\{(filter_\w+)\}/g;
              const foundFilters = [];
              let match;
              while ((match = filterPattern.exec(newStatement)) !== null) {
                if (!foundFilters.includes(match[1])) {
                  foundFilters.push(match[1]);
                }
              }
              
              onChange({
                ...state,
                statement: newStatement,
                usedFilters: foundFilters,
                validated: true,
                lastValidated: Date.now(),
              });
            }}
            className="w-full h-64 p-3 font-mono text-sm bg-transparent rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none text-transparent caret-black"
            placeholder="Enter your SQL query..."
          />
        </div>
        
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
          <span>💡 Use <code className="bg-slate-100 px-1 rounded">{'{filter_name}'}</code> to reference filters</span>
        </div>
      </div>

      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <h4 className="text-sm font-medium text-slate-700 mb-2">Filter Reference</h4>
        <div className="flex flex-wrap gap-2">
          {filtersState.selected.map(filterId => (
            <code 
              key={filterId}
              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs cursor-pointer hover:bg-blue-200"
              onClick={() => {
                onChange({
                  ...state,
                  statement: statement + `{${filterId}}`,
                  usedFilters: [...new Set([...usedFilters, filterId])],
                  validated: true,
                  lastValidated: Date.now(),
                });
              }}
            >
              {`{${filterId}}`}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
};

const PreviewEditor = ({ state, onChange, queryState, isOutdated, onRunQuery }) => {
  const { data, columns } = state;
  
  return (
    <div className="space-y-4">
      {isOutdated && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span className="flex-1">Query has changed. Preview data may be outdated.</span>
          <button onClick={onRunQuery} className="btn-warning text-sm">
            <RefreshCw size={14} className="inline mr-1" />
            Re-run Query
          </button>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">Data Table Preview</h3>
        <button onClick={onRunQuery} className="btn-secondary text-sm">
          Run Query
        </button>
      </div>
      
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                {columns.map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  {columns.map(col => (
                    <td key={col} className="px-4 py-3 text-sm text-slate-700">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="text-xs text-slate-500">
        Showing {data.length} row(s) • Last updated: {new Date(state.lastValidated).toLocaleTimeString()}
      </div>
    </div>
  );
};

const MappingEditor = ({ state, onChange, previewState, isOutdated }) => {
  const { valueMapping, previousValueField, compareValueField } = state;
  const availableColumns = previewState.columns;
  
  const mappingFields = [
    { key: 'valueMapping', label: 'Value Mapping', required: true },
    { key: 'previousValueField', label: 'Previous Value Field', required: true },
    { key: 'compareValueField', label: '% Compare Value Field', required: true },
  ];

  const getFieldStatus = (fieldKey, currentValue) => {
    if (!currentValue) return 'empty';
    if (!availableColumns.includes(currentValue)) return 'invalid';
    return 'valid';
  };

  return (
    <div className="space-y-4">
      {isOutdated && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>Preview data has changed. Some mappings may reference columns that no longer exist.</span>
        </div>
      )}
      
      <div className="space-y-4">
        {mappingFields.map(field => {
          const currentValue = state[field.key];
          const status = getFieldStatus(field.key, currentValue);
          
          return (
            <div key={field.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <select
                  value={currentValue || ''}
                  onChange={(e) => onChange({
                    ...state,
                    [field.key]: e.target.value,
                    validated: true,
                    lastValidated: Date.now(),
                  })}
                  className={`input-field pr-10 ${
                    status === 'invalid' ? 'border-red-300 bg-red-50' : ''
                  }`}
                >
                  <option value="">Select field...</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                  {currentValue && !availableColumns.includes(currentValue) && (
                    <option value={currentValue} className="text-red-600">
                      {currentValue} (not found)
                    </option>
                  )}
                </select>
                {status === 'valid' && (
                  <CheckCircle2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
                )}
                {status === 'invalid' && (
                  <XCircle size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" />
                )}
              </div>
              {status === 'invalid' && (
                <p className="mt-1 text-xs text-red-600">
                  Column "{currentValue}" no longer exists in preview data
                </p>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h4 className="text-sm font-medium text-slate-700 mb-2">Available Columns from Preview</h4>
        <div className="flex flex-wrap gap-2">
          {availableColumns.map(col => (
            <code key={col} className="px-2 py-1 bg-white border border-slate-200 rounded text-sm">
              {col}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function ChartConfigDemo() {
  const [configState, setConfigState] = useState(INITIAL_STATE);
  const [activeStep, setActiveStep] = useState('filters');
  const [changeHistory, setChangeHistory] = useState([]);

  const detectQueryIssues = useCallback(() => {
    const issues = [];
    const { query, filters } = configState;
    
    query.usedFilters.forEach(filterId => {
      if (!filters.selected.includes(filterId)) {
        issues.push({
          type: 'error',
          message: `Filter "${filterId}" is used in query but no longer exists in selected filters.`,
          actions: [
            { label: 'Remove from query', action: 'removeFilterFromQuery', payload: filterId },
            { label: 'Restore filter', action: 'restoreFilter', payload: filterId },
          ]
        });
      }
    });
    
    return issues;
  }, [configState]);

  const getStepStatus = useCallback((stepId) => {
    const { filters, query, preview, mapping } = configState;
    
    switch (stepId) {
      case 'filters':
        return { status: STATUS.VALID, reason: null };
      
      case 'query': {
        const missingFilters = query.usedFilters.filter(f => !filters.selected.includes(f));
        if (missingFilters.length > 0) {
          return { 
            status: STATUS.NEEDS_UPDATE, 
            reason: `Uses removed filters: ${missingFilters.join(', ')}` 
          };
        }
        if (query.lastValidated < filters.lastValidated) {
          return { status: STATUS.NEEDS_UPDATE, reason: 'Filters changed' };
        }
        return { status: STATUS.VALID, reason: null };
      }
      
      case 'preview': {
        const queryStatus = getStepStatus('query');
        if (queryStatus.status !== STATUS.VALID) {
          return { status: STATUS.OUTDATED, reason: 'Query needs update first' };
        }
        if (preview.lastValidated < query.lastValidated) {
          return { status: STATUS.NEEDS_UPDATE, reason: 'Query changed, re-run needed' };
        }
        return { status: STATUS.VALID, reason: null };
      }
      
      case 'mapping': {
        const previewStatus = getStepStatus('preview');
        if (previewStatus.status === STATUS.OUTDATED) {
          return { status: STATUS.OUTDATED, reason: 'Preview is outdated' };
        }
        if (previewStatus.status === STATUS.NEEDS_UPDATE) {
          return { status: STATUS.NEEDS_UPDATE, reason: 'Preview needs update' };
        }
        
        const invalidMappings = [];
        if (mapping.valueMapping && !preview.columns.includes(mapping.valueMapping)) {
          invalidMappings.push(mapping.valueMapping);
        }
        if (mapping.previousValueField && !preview.columns.includes(mapping.previousValueField)) {
          invalidMappings.push(mapping.previousValueField);
        }
        if (mapping.compareValueField && !preview.columns.includes(mapping.compareValueField)) {
          invalidMappings.push(mapping.compareValueField);
        }
        
        if (invalidMappings.length > 0) {
          return { status: STATUS.NEEDS_UPDATE, reason: `Invalid columns: ${invalidMappings.join(', ')}` };
        }
        
        if (mapping.lastValidated < preview.lastValidated) {
          return { status: STATUS.NEEDS_UPDATE, reason: 'Preview changed' };
        }
        
        return { status: STATUS.VALID, reason: null };
      }
      
      default:
        return { status: STATUS.VALID, reason: null };
    }
  }, [configState]);

  const steps = useMemo(() => [
    { id: 'filters', name: 'Filters', ...getStepStatus('filters') },
    { id: 'query', name: 'Query', ...getStepStatus('query') },
    { id: 'preview', name: 'Preview', ...getStepStatus('preview') },
    { id: 'mapping', name: 'Mapping', ...getStepStatus('mapping') },
  ], [getStepStatus]);

  const handleFilterChange = (newFilters) => {
    setChangeHistory(prev => [...prev, { type: 'filters', timestamp: Date.now() }]);
    setConfigState(prev => ({
      ...prev,
      filters: newFilters,
    }));
  };

  const handleQueryChange = (newQuery) => {
    setConfigState(prev => ({
      ...prev,
      query: newQuery,
    }));
  };

  const handlePreviewChange = (newPreview) => {
    setConfigState(prev => ({
      ...prev,
      preview: newPreview,
    }));
  };

  const handleMappingChange = (newMapping) => {
    setConfigState(prev => ({
      ...prev,
      mapping: newMapping,
    }));
  };

  const handleRunQuery = () => {
    setConfigState(prev => ({
      ...prev,
      preview: {
        ...prev.preview,
        validated: true,
        lastValidated: Date.now(),
      }
    }));
  };

  const handleSmartAction = (action, payload) => {
    switch (action) {
      case 'removeFilterFromQuery': {
        const newStatement = configState.query.statement.replace(
          new RegExp(`\\{${payload}\\}`, 'g'), 
          `/* REMOVED: {${payload}} */`
        );
        handleQueryChange({
          ...configState.query,
          statement: newStatement,
          usedFilters: configState.query.usedFilters.filter(f => f !== payload),
          validated: true,
          lastValidated: Date.now(),
        });
        break;
      }
      case 'restoreFilter': {
        handleFilterChange({
          ...configState.filters,
          selected: [...configState.filters.selected, payload],
          sampleValues: {
            ...configState.filters.sampleValues,
            [payload]: [],
          },
          validated: true,
          lastValidated: Date.now(),
        });
        break;
      }
    }
  };

  const queryIssues = detectQueryIssues();
  const allValid = steps.every(s => s.status === STATUS.VALID);

  const renderActiveStep = () => {
    const stepStatus = getStepStatus(activeStep);
    
    switch (activeStep) {
      case 'filters':
        return (
          <FiltersEditor 
            state={configState.filters} 
            onChange={handleFilterChange}
          />
        );
      case 'query':
        return (
          <QueryEditor 
            state={configState.query} 
            onChange={handleQueryChange}
            filtersState={configState.filters}
            issues={queryIssues}
            onAction={handleSmartAction}
          />
        );
      case 'preview':
        return (
          <PreviewEditor 
            state={configState.preview}
            onChange={handlePreviewChange}
            queryState={configState.query}
            isOutdated={stepStatus.status !== STATUS.VALID}
            onRunQuery={handleRunQuery}
          />
        );
      case 'mapping':
        return (
          <MappingEditor 
            state={configState.mapping}
            onChange={handleMappingChange}
            previewState={configState.preview}
            isOutdated={stepStatus.status !== STATUS.VALID}
          />
        );
      default:
        return null;
    }
  };

  const currentStepInfo = steps.find(s => s.id === activeStep);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Chart Configuration Demo</h1>
            <p className="text-sm text-slate-500">Cascading dependency configuration flow</p>
          </div>
          <div className="flex items-center gap-3">
            {!allValid && (
              <span className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle size={16} />
                {steps.filter(s => s.status !== STATUS.VALID).length} step(s) need attention
              </span>
            )}
            <button 
              className={`btn-primary ${!allValid ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!allValid}
            >
              Save Changes
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <StepPanel 
          steps={steps} 
          activeStep={activeStep} 
          onStepClick={setActiveStep} 
        />
        
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-800">
                    Step {steps.findIndex(s => s.id === activeStep) + 1}: {currentStepInfo?.name}
                  </h2>
                  <StatusBadge status={currentStepInfo?.status || STATUS.VALID} />
                </div>
                {currentStepInfo?.reason && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <Info size={16} />
                    {currentStepInfo.reason}
                  </div>
                )}
              </div>
              
              {renderActiveStep()}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => {
                  const currentIdx = steps.findIndex(s => s.id === activeStep);
                  if (currentIdx > 0) setActiveStep(steps[currentIdx - 1].id);
                }}
                className="btn-secondary"
                disabled={activeStep === 'filters'}
              >
                ← Previous Step
              </button>
              <button
                onClick={() => {
                  const currentIdx = steps.findIndex(s => s.id === activeStep);
                  if (currentIdx < steps.length - 1) setActiveStep(steps[currentIdx + 1].id);
                }}
                className="btn-primary"
                disabled={activeStep === 'mapping'}
              >
                Next Step →
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
