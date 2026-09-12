import React, { useEffect, useState, useMemo } from 'react';
import { expenseService } from '../../services/expenseService';
import { vendorService } from '../../services/vendorService';
import { machineService } from '../../services/machineService';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';
import {
  LucideDollarSign, LucidePlus, LucideSearch, LucideFilter,
  LucideDownload, LucideEye, LucideEdit, LucideTrash2,
  LucideCheckCircle, LucideXCircle, LucideClock, LucideFileText,
  LucideCalendar, LucideUser, LucideBuilding, LucideTruck,
  LucideClipboardList, LucideLayers, LucideRefreshCw, LucideUpload,
  LucideTag, LucideShieldAlert, LucideCreditCard
} from 'lucide-react';
import '../../styles/components.css';

// Helper to safely extract arrays from any API response structure
const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.results)) return val.results;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && val.data && Array.isArray(val.data.results)) return val.data.results;
  return [];
};

export const Expenses = () => {
  const auth = useAuth();
  const user = auth?.user || null;
  const isAdmin = Boolean(auth?.isAdmin);
  const hasRole = typeof auth?.hasRole === 'function' ? auth.hasRole : () => false;

  // State
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [machines, setMachines] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [usersList, setUsersList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showDashboard, setShowDashboard] = useState(true);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    category: 'ALL',
    subcategory: 'ALL',
    vendor_id: 'ALL',
    machine_id: 'ALL',
    task_id: 'ALL',
    status: 'ALL',
    payment_mode: 'ALL',
    date_from: '',
    date_to: ''
  });

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ payment_mode: 'CASH', payment_reference: '' });
  const [genMonthlyModalOpen, setGenMonthlyModalOpen] = useState(false);
  const [genMonthlyForm, setGenMonthlyForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), vendor_id: '' });
  const [generatingMonthly, setGeneratingMonthly] = useState(false);

  // Form State
  const [formState, setFormState] = useState({
    expense_date: new Date().toISOString().split('T')[0],
    category_id: '',
    subcategory_id: '',
    title: '',
    description: '',
    project: '',
    site: '',
    vendor_id: '',
    machine_id: '',
    task_id: '',
    operator_id: '',
    quantity: '1',
    unit: 'NOS',
    rate: '0',
    discount: '0',
    gst_applicable: false,
    gst_percentage: '18',
    supplier_name: '',
    invoice_number: '',
    invoice_date: '',
    payment_mode: 'CASH',
    payment_reference: '',
    remarks: '',
    status: 'DRAFT'
  });
  const [attachmentFile, setAttachmentFile] = useState(null);

  // Load Categories & Reference Data safely
  useEffect(() => {
    expenseService.getCategories()
      .then(res => {
        setCategories(ensureArray(res));
      })
      .catch(err => console.error("Error loading expense categories:", err));

    vendorService.getVendors({ page_size: 200 })
      .then(res => {
        setVendors(ensureArray(res));
      })
      .catch(() => {});

    machineService.getAll({ page_size: 300 })
      .then(res => {
        setMachines(ensureArray(res));
      })
      .catch(() => {});

    // Load integration assigned tasks (Trenching/Ducting) & local database tasks
    Promise.all([
      taskService.getMyTasks({ size: 300 }).catch(() => null),
      taskService.getAll({ page_size: 300 }).catch(() => null)
    ]).then(([myTasksRes, allTasksRes]) => {
      const myTasksArr = ensureArray(myTasksRes);
      const allTasksArr = ensureArray(allTasksRes);

      const normalizedMyTasks = myTasksArr.map(t => {
        let typeStr = t.taskType || t.task_type || '';
        if (typeStr === 'FIBER_TRENCHING_DUCTING_TASK') typeStr = 'Trenching / Ducting';
        else if (typeStr === 'GP_SURVEY') typeStr = 'GP Survey';
        else if (typeStr === 'FIBER_SURVEY') typeStr = 'Fiber Survey';
        else if (typeStr === 'OTDR_SURVEY') typeStr = 'OTDR Survey';

        const codeStr = t.taskCode || t.code || t.id || '';
        const rawLoc = t.location || t.site_name || t.site || '';
        const locStr = typeof rawLoc === 'string' ? rawLoc : (rawLoc?.name || rawLoc?.title || rawLoc?.address || '');
        const displayLabel = typeStr ? `${typeStr} - ${codeStr}` : (codeStr || 'Assigned Task');

        return {
          id: t.id || codeStr,
          raw_code: codeStr,
          task_type: typeStr || 'Trenching / Ducting',
          title: displayLabel,
          site_name: locStr,
          vendor: t.vendor || t.vendor_id || t.assigned_vendor,
          vendor_name: t.assigned_vendor || t.vendor_name
        };
      });

      const combined = [...normalizedMyTasks, ...allTasksArr];
      setTasks(combined);
    }).catch(err => console.error("Error loading tasks:", err));

    userService.getUsers({ size: 300 })
      .then(res => {
        setUsersList(ensureArray(res));
      })
      .catch(() => {});
  }, []);

  // Fetch Expenses & Dashboard Stats safely
  const fetchExpenseData = React.useCallback(async () => {
    setLoading(true);
    try {
      const activeParams = {};
      Object.keys(filters).forEach(k => {
        if (filters[k] && filters[k] !== 'ALL') {
          activeParams[k] = filters[k];
        }
      });

      const [expRes, statsRes] = await Promise.all([
        expenseService.getAll(activeParams),
        expenseService.getDashboardStats(activeParams)
      ]);

      setExpenses(ensureArray(expRes));

      const sData = statsRes?.data || statsRes || null;
      setStats(sData);
    } catch (err) {
      console.error("Error loading expenses data:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchExpenseData();
  }, [fetchExpenseData]);

  // Safe category & subcategory options
  const catList = useMemo(() => ensureArray(categories), [categories]);

  const currentFormCategoryObj = useMemo(() => {
    return catList.find(c => String(c.id) === String(formState.category_id) || c.name === formState.category_id);
  }, [catList, formState.category_id]);

  const formSubcategoryOptions = useMemo(() => {
    if (!currentFormCategoryObj) return [];
    return ensureArray(currentFormCategoryObj.subcategories);
  }, [currentFormCategoryObj]);

  // Safe Filtered Machines & Tasks by selected Vendor in Form
  const filteredFormMachines = useMemo(() => {
    const list = ensureArray(machines);
    if (!formState.vendor_id) return list;
    return list.filter(m => String(m.vendor) === String(formState.vendor_id) || String(m.vendor_id) === String(formState.vendor_id));
  }, [machines, formState.vendor_id]);

  const filteredFormTasks = useMemo(() => {
    const list = ensureArray(tasks);
    const vendorFiltered = !formState.vendor_id
      ? list
      : list.filter(t => String(t.vendor) === String(formState.vendor_id) || String(t.vendor_id) === String(formState.vendor_id));

    // Deduplicate by task_type so only one option per unique task category appears
    const seenTypes = new Set();
    const uniqueTasks = [];

    vendorFiltered.forEach(t => {
      let typeLabel = (t.task_type || t.title || 'Trenching / Ducting').trim();
      if (typeLabel === 'FIBER_TRENCHING_DUCTING_TASK') typeLabel = 'Trenching / Ducting';

      if (!seenTypes.has(typeLabel)) {
        seenTypes.add(typeLabel);
        uniqueTasks.push({
          ...t,
          task_type: typeLabel,
          display_label: typeLabel
        });
      }
    });

    return uniqueTasks;
  }, [tasks, formState.vendor_id]);

  // Handle Category / Expense Master selection -> Step 2: Auto-loads Payment Type, UoM, Default Qty, Default Rate
  const handleCategoryChange = (catIdVal) => {
    if (!catIdVal) {
      setFormState(prev => ({ ...prev, category_id: '', subcategory_id: '' }));
      return;
    }

    const selectedCatObj = catList.find(c => String(c.id) === String(catIdVal));
    if (selectedCatObj) {
      const defQty = selectedCatObj.default_quantity !== null && selectedCatObj.default_quantity !== undefined ? String(selectedCatObj.default_quantity) : '1';
      const defRate = selectedCatObj.default_rate !== null && selectedCatObj.default_rate !== undefined ? String(selectedCatObj.default_rate) : '0';
      const defUom = selectedCatObj.uom || 'NOS';
      const reqProof = Boolean(selectedCatObj.requires_proof || selectedCatObj.payment_type === 'ACTUAL_WITH_PROOF');

      setFormState(prev => {
        const existingItems = Array.isArray(prev.items) && prev.items.length > 0 ? prev.items : [];
        const updatedItems = existingItems.map((it, idx) => {
          if (idx === 0) {
            return {
              ...it,
              category_id: catIdVal,
              subcategory_id: '',
              description: it.description || selectedCatObj.name,
              quantity: defQty,
              unit: defUom,
              rate: defRate
            };
          }
          return it;
        });

        return {
          ...prev,
          category_id: catIdVal,
          subcategory_id: '',
          title: prev.title || selectedCatObj.name,
          payment_type: selectedCatObj.payment_type || 'ACTUAL_WITH_PROOF',
          requires_proof: reqProof,
          unit: defUom,
          quantity: defQty,
          rate: defRate,
          items: updatedItems.length > 0 ? updatedItems : [
            {
              id: Date.now(),
              category_id: catIdVal,
              subcategory_id: '',
              description: selectedCatObj.name,
              quantity: defQty,
              unit: defUom,
              rate: defRate,
              discount: '0',
              gst_applicable: false,
              gst_percentage: '18'
            }
          ]
        };
      });
    } else {
      setFormState(prev => ({ ...prev, category_id: catIdVal, subcategory_id: '' }));
    }
  };

  // Handle individual line item Category change
  const handleLineItemCategoryChange = (itemId, catIdVal) => {
    const selectedCatObj = catList.find(c => String(c.id) === String(catIdVal));
    setFormState(prev => {
      const currentItems = Array.isArray(prev.items) ? [...prev.items] : [];
      const updated = currentItems.map(it => {
        if (it.id === itemId) {
          if (selectedCatObj) {
            const defQty = selectedCatObj.default_quantity !== null && selectedCatObj.default_quantity !== undefined ? String(selectedCatObj.default_quantity) : '1';
            const defRate = selectedCatObj.default_rate !== null && selectedCatObj.default_rate !== undefined ? String(selectedCatObj.default_rate) : '0';
            const defUom = selectedCatObj.uom || 'NOS';
            return {
              ...it,
              category_id: catIdVal,
              subcategory_id: '',
              description: it.description || selectedCatObj.name,
              quantity: defQty,
              unit: defUom,
              rate: defRate
            };
          }
          return { ...it, category_id: catIdVal, subcategory_id: '' };
        }
        return it;
      });
      return { ...prev, items: updated };
    });
  };

  // Handle Task selection -> Auto fills Expense Title & Project/Site Name
  const handleTaskChange = (taskIdVal) => {
    if (!taskIdVal) {
      setFormState(prev => ({ ...prev, task_id: '' }));
      return;
    }

    const taskList = ensureArray(tasks);
    const selectedTask = taskList.find(t => String(t.id) === String(taskIdVal));
    if (selectedTask) {
      const taskDisplayTitle = selectedTask.task_type || selectedTask.title || 'Assigned Task';
      const projectName = selectedTask.title || selectedTask.site_name || selectedTask.location || 'Project Site';

      const updates = {
        task_id: taskIdVal,
        title: taskDisplayTitle,
        site: projectName
      };

      if (selectedTask.vendor || selectedTask.vendor_id) {
        updates.vendor_id = selectedTask.vendor || selectedTask.vendor_id;
      }
      if (selectedTask.machine || selectedTask.machine_id) {
        updates.machine_id = selectedTask.machine || selectedTask.machine_id;
      }
      setFormState(prev => ({ ...prev, ...updates }));
    } else {
      setFormState(prev => ({ ...prev, task_id: taskIdVal, title: taskIdVal }));
    }
  };

  // Multi-item calculation & item helpers
  const handleAddItemRow = () => {
    setFormState(prev => {
      const defaultCatObj = catList.find(c => String(c.id) === String(prev.category_id)) || (catList.length > 0 ? catList[0] : null);
      const defQty = defaultCatObj?.default_quantity !== null && defaultCatObj?.default_quantity !== undefined ? String(defaultCatObj.default_quantity) : '1';
      const defRate = defaultCatObj?.default_rate !== null && defaultCatObj?.default_rate !== undefined ? String(defaultCatObj.default_rate) : '0';
      const defUom = defaultCatObj?.uom || 'NOS';

      const currentItems = Array.isArray(prev.items) && prev.items.length > 0 ? prev.items : [];

      return {
        ...prev,
        items: [
          ...currentItems,
          {
            id: Date.now() + Math.random(),
            category_id: defaultCatObj ? defaultCatObj.id : '',
            subcategory_id: prev.subcategory_id || '',
            description: defaultCatObj ? defaultCatObj.name : '',
            quantity: defQty,
            unit: defUom,
            rate: defRate,
            discount: '0',
            gst_applicable: false,
            gst_percentage: '18'
          }
        ]
      };
    });
  };

  const handleRemoveItemRow = (id) => {
    setFormState(prev => {
      const currentItems = Array.isArray(prev.items) ? prev.items : [];
      const filtered = currentItems.filter(it => it.id !== id);
      return {
        ...prev,
        items: filtered.length > 0 ? filtered : [{
          id: Date.now(),
          category_id: prev.category_id || '',
          subcategory_id: prev.subcategory_id || '',
          description: '',
          quantity: '1',
          unit: 'NOS',
          rate: '0',
          discount: '0',
          gst_applicable: false,
          gst_percentage: '18'
        }]
      };
    });
  };

  const handleUpdateItemRow = (id, field, val) => {
    setFormState(prev => {
      const currentItems = Array.isArray(prev.items) && prev.items.length > 0 ? [...prev.items] : [{
        id: 1,
        category_id: prev.category_id || '',
        subcategory_id: prev.subcategory_id || '',
        description: '',
        quantity: prev.quantity || '1',
        unit: prev.unit || 'NOS',
        rate: prev.rate || '0',
        discount: prev.discount || '0',
        gst_applicable: Boolean(prev.gst_applicable),
        gst_percentage: prev.gst_percentage || '18'
      }];

      const updated = currentItems.map(it => {
        if (it.id === id) {
          return { ...it, [field]: val };
        }
        return it;
      });

      return { ...prev, items: updated };
    });
  };

  // Live amount calculation across all items
  const calculatedAmounts = useMemo(() => {
    const itemList = ensureArray(formState.items);

    if (itemList.length === 0) {
      const qty = parseFloat(formState.quantity) || 0;
      const rt = parseFloat(formState.rate) || 0;
      const disc = parseFloat(formState.discount) || 0;
      const gstPct = formState.gst_applicable ? (parseFloat(formState.gst_percentage) || 0) : 0;

      const basic = qty * rt;
      const taxable = Math.max(0, basic - disc);
      const gstAmt = taxable * (gstPct / 100);
      const tot = taxable + gstAmt;

      return {
        basic_amount: basic.toFixed(2),
        taxable_amount: taxable.toFixed(2),
        gst_amount: gstAmt.toFixed(2),
        total_amount: tot.toFixed(2)
      };
    }

    let totBasic = 0;
    let totTaxable = 0;
    let totGst = 0;
    let totGrand = 0;

    itemList.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const rt = parseFloat(item.rate) || 0;
      const disc = parseFloat(item.discount) || 0;
      const gstPct = item.gst_applicable ? (parseFloat(item.gst_percentage) || 0) : 0;

      const basic = qty * rt;
      const taxable = Math.max(0, basic - disc);
      const gstAmt = taxable * (gstPct / 100);
      const tot = taxable + gstAmt;

      totBasic += basic;
      totTaxable += taxable;
      totGst += gstAmt;
      totGrand += tot;
    });

    return {
      basic_amount: totBasic.toFixed(2),
      taxable_amount: totTaxable.toFixed(2),
      gst_amount: totGst.toFixed(2),
      total_amount: totGrand.toFixed(2)
    };
  }, [formState.items, formState.quantity, formState.rate, formState.discount, formState.gst_applicable, formState.gst_percentage]);

  // Open Create Modal
  const openCreateModal = () => {
    setEditExpense(null);
    setAttachmentFile(null);
    setFormState({
      expense_date: new Date().toISOString().split('T')[0],
      category_id: catList.length > 0 ? catList[0].id : '',
      subcategory_id: '',
      title: '',
      description: '',
      project: '',
      site: '',
      vendor_id: (user?.vendor_id || (user?.vendors && user.vendors[0]?.id)) || '',
      machine_id: '',
      task_id: '',
      operator_id: '',
      quantity: '1',
      unit: 'NOS',
      rate: '0',
      discount: '0',
      gst_applicable: false,
      gst_percentage: '18',
      items: [
        { id: Date.now(), description: '', quantity: '1', unit: 'NOS', rate: '0', discount: '0', gst_applicable: false, gst_percentage: '18' }
      ],
      supplier_name: '',
      invoice_number: '',
      invoice_date: '',
      payment_mode: 'CASH',
      payment_reference: '',
      remarks: '',
      status: 'DRAFT'
    });
    setFormModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (exp) => {
    setEditExpense(exp);
    setAttachmentFile(null);

    const catObj = catList.find(c => c.name === exp.category || c.id === exp.category_ref);

    setFormState({
      expense_date: exp.expense_date || new Date().toISOString().split('T')[0],
      category_id: catObj ? catObj.id : (exp.category_ref || exp.category || ''),
      subcategory_id: exp.subcategory_ref || '',
      title: exp.title || '',
      description: exp.description || '',
      project: exp.project || '',
      site: exp.site || '',
      vendor_id: exp.vendor || exp.vendor_id || '',
      machine_id: exp.machine || exp.machine_id || '',
      task_id: exp.task || exp.task_id || '',
      operator_id: exp.operator || exp.operator_id || '',
      quantity: String(exp.quantity || '1'),
      unit: exp.unit || 'NOS',
      rate: String(exp.rate || '0'),
      discount: String(exp.discount || '0'),
      gst_applicable: Boolean(exp.gst_applicable),
      gst_percentage: String(exp.gst_percentage || '18'),
      items: Array.isArray(exp.items) && exp.items.length > 0 ? exp.items : [
        {
          id: Date.now(),
          description: exp.title || '',
          quantity: String(exp.quantity || '1'),
          unit: exp.unit || 'NOS',
          rate: String(exp.rate || '0'),
          discount: String(exp.discount || '0'),
          gst_applicable: Boolean(exp.gst_applicable),
          gst_percentage: String(exp.gst_percentage || '18')
        }
      ],
      supplier_name: exp.supplier_name || '',
      invoice_number: exp.invoice_number || '',
      invoice_date: exp.invoice_date || '',
      payment_mode: exp.payment_mode || 'CASH',
      payment_reference: exp.payment_reference || '',
      remarks: exp.remarks || '',
      status: exp.status || 'DRAFT'
    });
    setFormModalOpen(true);
  };

  // Save Expense (Create or Update)
  const handleSaveExpense = async (e) => {
    if (e) e.preventDefault();

    if (!formState.title.trim()) {
      setStatusMessage({ type: 'error', text: 'Expense title is required.' });
      return;
    }
    if (!formState.expense_date) {
      setStatusMessage({ type: 'error', text: 'Expense date is required.' });
      return;
    }

    // Proof / Attachment Validation if requires_proof is True or payment_type === ACTUAL_WITH_PROOF
    const selectedCatObj = catList.find(c => String(c.id) === String(formState.category_id));
    const requiresProof = Boolean(
      formState.requires_proof ||
      selectedCatObj?.requires_proof ||
      formState.payment_type === 'ACTUAL_WITH_PROOF' ||
      selectedCatObj?.payment_type === 'ACTUAL_WITH_PROOF'
    );

    if (requiresProof && !attachmentFile && (!editExpense || (!editExpense.attachment_url && !editExpense.attachment))) {
      setStatusMessage({ type: 'error', text: 'Proof attachment (bill/receipt) is required for this expense before submission.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const selectedCatObj = catList.find(c => String(c.id) === String(formState.category_id));
      const itemsList = ensureArray(formState.items);
      let totalQty = 0;
      let lineSummaries = [];

      if (itemsList.length > 0) {
        itemsList.forEach((it, idx) => {
          const q = parseFloat(it.quantity) || 0;
          const r = parseFloat(it.rate) || 0;
          totalQty += q;
          const label = it.description ? it.description : `Item #${idx + 1}`;
          lineSummaries.push(`${label}: ${q} ${it.unit || 'NOS'} @ ₹${r}`);
        });
      }

      const payload = {
        title: formState.title.trim(),
        expense_date: formState.expense_date,
        category: selectedCatObj ? selectedCatObj.name : (formState.category_id || 'MISCELLANEOUS'),
        category_ref: selectedCatObj ? selectedCatObj.id : null,
        subcategory: formState.subcategory_id ? (formSubcategoryOptions.find(s => String(s.id) === String(formState.subcategory_id))?.name || formState.subcategory_id) : '',
        subcategory_ref: formState.subcategory_id && !isNaN(Number(formState.subcategory_id)) ? Number(formState.subcategory_id) : null,
        description: formState.description.trim(),
        project: formState.project.trim(),
        site: formState.site.trim(),
        vendor_id: formState.vendor_id || null,
        machine: formState.machine_id || null,
        task: formState.task_id || null,
        operator: formState.operator_id || null,
        quantity: itemsList.length > 1 ? totalQty : (parseFloat(formState.items?.[0]?.quantity || formState.quantity) || 1),
        unit: formState.items?.[0]?.unit || formState.unit || 'NOS',
        rate: itemsList.length > 1 ? (parseFloat(calculatedAmounts.total_amount) / (totalQty || 1)) : (parseFloat(formState.items?.[0]?.rate || formState.rate) || 0),
        discount: parseFloat(formState.items?.[0]?.discount || formState.discount) || 0,
        gst_applicable: Boolean(formState.items?.[0]?.gst_applicable ?? formState.gst_applicable),
        gst_percentage: parseFloat(formState.items?.[0]?.gst_percentage || formState.gst_percentage) || 18,
        amount: parseFloat(calculatedAmounts.total_amount) || 0,
        total_amount: parseFloat(calculatedAmounts.total_amount) || 0,
        supplier_name: formState.supplier_name ? formState.supplier_name.trim() : '',
        invoice_number: formState.invoice_number.trim(),
        invoice_date: formState.invoice_date || null,
        payment_mode: formState.payment_mode || 'CASH',
        payment_reference: formState.payment_reference.trim(),
        remarks: lineSummaries.length > 1 ? `Line Items:\n${lineSummaries.join('\n')}\n\n${formState.remarks || ''}`.trim() : (formState.remarks || ''),
        status: formState.status || 'DRAFT'
      };

      let finalPayload = payload;
      if (attachmentFile) {
        const formData = new FormData();
        Object.keys(payload).forEach(key => {
          if (payload[key] !== null && payload[key] !== undefined) {
            formData.append(key, payload[key]);
          }
        });
        formData.append('attachment', attachmentFile);
        finalPayload = formData;
      }

      if (editExpense) {
        await expenseService.update(editExpense.id, finalPayload);
        setStatusMessage({ type: 'success', text: `Expense "${formState.title}" updated successfully.` });
      } else {
        await expenseService.create(finalPayload);
        setStatusMessage({ type: 'success', text: `Expense "${formState.title}" created successfully.` });
      }

      setFormModalOpen(false);
      await fetchExpenseData();
    } catch (err) {
      console.error("Error saving expense:", err);
      const errText = err?.message || err?.detail || 'Unable to save expense.';
      setStatusMessage({ type: 'error', text: typeof errText === 'string' ? errText : JSON.stringify(errText) });
    } finally {
      setSubmitting(false);
    }
  };

  // Workflow Handlers
  const handleSubmitWorkflow = async (exp) => {
    try {
      await expenseService.submit(exp.id);
      setStatusMessage({ type: 'success', text: `Expense "${exp.title}" submitted for approval.` });
      await fetchExpenseData();
      if (detailModalOpen) setDetailModalOpen(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to submit expense.' });
    }
  };

  const handleApproveWorkflow = async (exp) => {
    try {
      await expenseService.approve(exp.id);
      setStatusMessage({ type: 'success', text: `Expense "${exp.title}" approved successfully.` });
      await fetchExpenseData();
      if (detailModalOpen) setDetailModalOpen(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to approve expense.' });
    }
  };

  const handleRejectWorkflowSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!rejectModalOpen) return;
    try {
      await expenseService.reject(rejectModalOpen.id, rejectionReason);
      setStatusMessage({ type: 'success', text: `Expense "${rejectModalOpen.title}" rejected.` });
      setRejectModalOpen(null);
      setRejectionReason('');
      await fetchExpenseData();
      if (detailModalOpen) setDetailModalOpen(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to reject expense.' });
    }
  };

  const handlePayWorkflowSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!payModalOpen) return;
    try {
      await expenseService.pay(payModalOpen.id, paymentForm);
      setStatusMessage({ type: 'success', text: `Expense "${payModalOpen.title}" marked as PAID.` });
      setPayModalOpen(null);
      await fetchExpenseData();
      if (detailModalOpen) setDetailModalOpen(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to mark expense as paid.' });
    }
  };

  // Generate Monthly Fixed Expenses Handler
  const handleGenerateMonthlySubmit = async (e) => {
    if (e) e.preventDefault();
    setGeneratingMonthly(true);
    try {
      const payload = {
        month: Number(genMonthlyForm.month),
        year: Number(genMonthlyForm.year),
        vendor_id: genMonthlyForm.vendor_id || undefined
      };
      const res = await expenseService.generateMonthlyExpenses(payload);
      const data = res?.data || res;
      setStatusMessage({
        type: 'success',
        text: data?.message || `Successfully generated ${data?.created_count || 0} monthly expenses (${data?.skipped_count || 0} already existed).`
      });
      setGenMonthlyModalOpen(false);
      await fetchExpenseData();
    } catch (err) {
      console.error("Error generating monthly expenses:", err);
      const msg = err?.response?.data?.detail || err?.message || 'Failed to generate monthly expenses.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setGeneratingMonthly(false);
    }
  };

  const handleDeleteExpense = async (exp) => {
    if (!window.confirm(`Are you sure you want to delete expense "${exp.title}"?`)) return;
    try {
      await expenseService.delete(exp.id);
      setStatusMessage({ type: 'success', text: `Expense deleted.` });
      await fetchExpenseData();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete expense.' });
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const activeParams = {};
      Object.keys(filters).forEach(k => {
        if (filters[k] && filters[k] !== 'ALL') activeParams[k] = filters[k];
      });

      const response = await expenseService.exportExpenses(activeParams);
      const blob = new Blob([response], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hero_expenses_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      setStatusMessage({ type: 'error', text: 'Failed to export expenses.' });
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (st) => {
    switch ((st || '').toUpperCase()) {
      case 'APPROVED':
        return <span className="badge-pill" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}><LucideCheckCircle size={12} /> Approved</span>;
      case 'PAID':
        return <span className="badge-pill" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #6ee7b7' }}><LucideCreditCard size={12} /> Paid</span>;
      case 'SUBMITTED':
        return <span className="badge-pill" style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}><LucideClock size={12} /> Submitted</span>;
      case 'REJECTED':
        return <span className="badge-pill" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}><LucideXCircle size={12} /> Rejected</span>;
      case 'DRAFT':
      default:
        return <span className="badge-pill" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}><LucideFileText size={12} /> Draft</span>;
    }
  };

  const expList = useMemo(() => ensureArray(expenses), [expenses]);
  const venList = useMemo(() => ensureArray(vendors), [vendors]);
  const userListSafe = useMemo(() => ensureArray(usersList), [usersList]);

  const catSubcategoriesFilter = useMemo(() => {
    const found = catList.find(c => c.name === filters.category);
    return found ? ensureArray(found.subcategories) : [];
  }, [catList, filters.category]);

  const byCatStats = useMemo(() => ensureArray(stats?.by_category), [stats]);
  const byVendorStats = useMemo(() => ensureArray(stats?.by_vendor), [stats]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px' }}>
      
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontFamily: 'Outfit', fontWeight: 'bold', color: '#111827', margin: 0 }}>
            HDD Operational Expense Management
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Comprehensive expense tracking, approval workflows & financial auditing for trenching & fiber operations.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowDashboard(!showDashboard)}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <LucideLayers size={16} />
            {showDashboard ? 'Hide Analytics' : 'Show Analytics'}
          </button>

          <button
            onClick={() => setGenMonthlyModalOpen(true)}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#1e40af', borderColor: '#bfdbfe' }}
            title="Generate monthly fixed expense transactions from Expense Master"
          >
            <LucideRefreshCw size={16} />
            Generate Fixed Expenses
          </button>
          
          <button
            onClick={handleExportCSV}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <LucideDownload size={16} />
            Export CSV
          </button>

          <button
            onClick={openCreateModal}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <LucidePlus size={16} />
            Add Expense
          </button>
        </div>
      </div>

      {/* Alert / Notification Banner */}
      {statusMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          fontWeight: '500',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: statusMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${statusMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: statusMessage.type === 'success' ? '#065f46' : '#991b1b'
        }}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {/* Dashboard Analytics Section */}
      {showDashboard && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            
            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Total Expenses</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111827', marginTop: '4px' }}>
                ₹{parseFloat(stats.total_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{stats.total_count || 0} Record(s)</div>
            </div>

            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>This Month</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e40af', marginTop: '4px' }}>
                ₹{parseFloat(stats.month_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>Today: ₹{parseFloat(stats.today_amount || 0).toLocaleString()}</div>
            </div>

            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Pending Approval</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#b45309', marginTop: '4px' }}>
                ₹{parseFloat(stats.submitted_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{stats.submitted_count || 0} Submitted</div>
            </div>

            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #059669' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Approved</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>
                ₹{parseFloat(stats.approved_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{stats.approved_count || 0} Approved</div>
            </div>

            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Paid</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#6d28d9', marginTop: '4px' }}>
                ₹{parseFloat(stats.paid_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{stats.paid_count || 0} Settled</div>
            </div>

            <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Rejected</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#b91c1c', marginTop: '4px' }}>
                ₹{parseFloat(stats.rejected_amount || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '2px' }}>{stats.rejected_count || 0} Rejected</div>
            </div>

          </div>

          {/* Category & Vendor Breakdown Widgets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            
            {/* Category Breakdown */}
            <div className="card" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: '#111827', marginBottom: '10px' }}>
                Expense Breakdown by Category
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {byCatStats.length > 0 ? (
                  byCatStats.map(cat => {
                    const pct = (stats.total_amount || 0) > 0 ? Math.round((cat.amount / stats.total_amount) * 100) : 0;
                    return (
                      <div key={cat.category} style={{ fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '600', color: '#374151' }}>{cat.category}</span>
                          <span style={{ color: '#111827', fontWeight: '700' }}>₹{parseFloat(cat.amount || 0).toLocaleString()} ({pct}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#059669' }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No category stats available.</div>
                )}
              </div>
            </div>

            {/* Vendor Breakdown */}
            <div className="card" style={{ padding: '16px' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: '#111827', marginBottom: '10px' }}>
                Expense Breakdown by Vendor
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {byVendorStats.length > 0 ? (
                  byVendorStats.map(ven => {
                    const pct = (stats.total_amount || 0) > 0 ? Math.round((ven.amount / stats.total_amount) * 100) : 0;
                    return (
                      <div key={ven.vendor} style={{ fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '600', color: '#374151' }}>{ven.vendor}</span>
                          <span style={{ color: '#111827', fontWeight: '700' }}>₹{parseFloat(ven.amount || 0).toLocaleString()} ({pct}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#2563eb' }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', padding: '20px' }}>No vendor stats available.</div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Filter Control Bar */}
      <div className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'center' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search title, ID, invoice..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.8rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <LucideSearch size={14} color="#9ca3af" style={{ position: 'absolute', left: '9px', top: '9px' }} />
          </div>

          {/* Category Filter */}
          <select
            value={filters.category}
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value, subcategory: 'ALL' }))}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none', background: '#fff' }}
          >
            <option value="ALL">All Categories</option>
            {catList.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Subcategory Filter */}
          <select
            value={filters.subcategory}
            onChange={(e) => setFilters(prev => ({ ...prev, subcategory: e.target.value }))}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none', background: '#fff' }}
          >
            <option value="ALL">All Subcategories</option>
            {catSubcategoriesFilter.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>

          {/* Vendor Filter */}
          <select
            value={filters.vendor_id}
            onChange={(e) => setFilters(prev => ({ ...prev, vendor_id: e.target.value }))}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none', background: '#fff' }}
          >
            <option value="ALL">All Vendors</option>
            {venList.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none', background: '#fff' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Payment Mode Filter */}
          <select
            value={filters.payment_mode}
            onChange={(e) => setFilters(prev => ({ ...prev, payment_mode: e.target.value }))}
            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none', background: '#fff' }}
          >
            <option value="ALL">All Payment Modes</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CREDIT">Credit</option>
          </select>

          {/* Date From */}
          <input
            type="date"
            placeholder="From Date"
            value={filters.date_from}
            onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.78rem', outline: 'none' }}
          />

          {/* Date To */}
          <input
            type="date"
            placeholder="To Date"
            value={filters.date_to}
            onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.78rem', outline: 'none' }}
          />

        </div>
      </div>

      {/* Main Expenses Table */}
      <div className="table-container" style={{ background: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Expense ID</th>
              <th>Date</th>
              <th>Category / Subcategory</th>
              <th>Vendor Scope</th>
              <th>Machine / Task</th>
              <th>Quantity & Rate</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Created By</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                  Loading expenses data...
                </td>
              </tr>
            ) : expList.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                  No expense records found matching current criteria.
                </td>
              </tr>
            ) : (
              expList.map(exp => (
                <tr key={exp.id}>
                  <td>
                    <span style={{ fontWeight: '700', color: '#111827', fontFamily: 'monospace' }}>
                      {exp.expense_id || `EXP-${exp.id}`}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#374151' }}>
                      {exp.expense_date}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <strong style={{ fontSize: '0.82rem', color: '#111827' }}>{exp.title}</strong>
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                        {exp.category_name || exp.category} {exp.subcategory_name ? `• ${exp.subcategory_name}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px', alignItems: 'center' }}>
                        <span className="badge-pill" style={{
                          fontSize: '0.66rem',
                          padding: '1px 6px',
                          background: exp.payment_type === 'FIXED_MONTHLY' ? '#eff6ff' : '#fef3c7',
                          color: exp.payment_type === 'FIXED_MONTHLY' ? '#1e40af' : '#92400e',
                          border: `1px solid ${exp.payment_type === 'FIXED_MONTHLY' ? '#bfdbfe' : '#fde68a'}`
                        }}>
                          {exp.payment_type === 'FIXED_MONTHLY' ? 'Fixed Monthly' : 'Actuals / As per Proof'}
                        </span>
                        {exp.requires_proof && (
                          <span className="badge-pill" style={{ fontSize: '0.64rem', padding: '1px 5px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                            Proof Req.
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '500' }}>
                      {exp.vendor_name || 'Direct / General'}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem' }}>
                      {exp.machine_name && (
                        <span style={{ color: '#111827', fontWeight: '600' }}>
                          Machine: {exp.machine_name}
                        </span>
                      )}
                      {exp.task_title && (
                        <span style={{ color: '#4b5563' }}>
                          Task: {exp.task_title}
                        </span>
                      )}
                      {!exp.machine_name && !exp.task_title && (
                        <span style={{ color: '#9ca3af' }}>General Site</span>
                      )}
                    </div>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.78rem', color: '#4b5563' }}>
                      {exp.quantity} {exp.unit || 'NOS'} × ₹{parseFloat(exp.rate || 0).toLocaleString()}
                    </span>
                  </td>

                  <td>
                    <strong style={{ fontSize: '0.9rem', color: '#047857' }}>
                      ₹{parseFloat(exp.total_amount || exp.amount || 0).toLocaleString()}
                    </strong>
                  </td>

                  <td>
                    {renderStatusBadge(exp.status)}
                  </td>

                  <td>
                    <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>
                      {exp.created_by_name || 'System'}
                    </span>
                  </td>

                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      
                      {/* View Detail */}
                      <button
                        onClick={() => setDetailModalOpen(exp)}
                        title="View Details"
                        style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer' }}
                      >
                        <LucideEye size={14} color="#374151" />
                      </button>

                      {/* Workflow buttons */}
                      {exp.status === 'DRAFT' && (
                        <button
                          onClick={() => handleSubmitWorkflow(exp)}
                          title="Submit for Approval"
                          style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}
                        >
                          Submit
                        </button>
                      )}

                      {exp.status === 'SUBMITTED' && (isAdmin || hasRole('MANAGER') || hasRole('PROJECT_MANAGER')) && (
                        <>
                          <button
                            onClick={() => handleApproveWorkflow(exp)}
                            title="Approve Expense"
                            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #10b981', background: '#ecfdf5', color: '#047857', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setRejectModalOpen(exp); setRejectionReason(''); }}
                            title="Reject Expense"
                            style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #ef4444', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {exp.status === 'APPROVED' && (isAdmin || hasRole('FINANCE') || hasRole('MANAGER')) && (
                        <button
                          onClick={() => { setPayModalOpen(exp); setPaymentForm({ payment_mode: exp.payment_mode || 'CASH', payment_reference: '' }); }}
                          title="Mark Paid"
                          style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #8b5cf6', background: '#f5f3ff', color: '#6d28d9', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}
                        >
                          Mark Paid
                        </button>
                      )}

                      {/* Edit */}
                      {(exp.status === 'DRAFT' || exp.status === 'REJECTED' || isAdmin) && (
                        <button
                          onClick={() => openEditModal(exp)}
                          title="Edit Expense"
                          style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer' }}
                        >
                          <LucideEdit size={14} color="#2563eb" />
                        </button>
                      )}

                      {/* Delete */}
                      {(exp.status === 'DRAFT' || exp.status === 'REJECTED' || isAdmin) && (
                        <button
                          onClick={() => handleDeleteExpense(exp)}
                          title="Delete Expense"
                          style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer' }}
                        >
                          <LucideTrash2 size={14} color="#ef4444" />
                        </button>
                      )}

                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT EXPENSE MODAL */}
      {formModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto',
            background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', pb: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                {editExpense ? `Edit Expense (${editExpense.expense_id || editExpense.id})` : 'Create Operational Expense Log'}
              </h3>
              <button onClick={() => setFormModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>

            <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Row 1: 2 Columns -> Expense Title (Assigned Task Dropdown / Input) & Project / Site Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>
                    Expense Title *
                  </label>
                  {filteredFormTasks.length > 0 ? (
                    <select
                      required
                      value={formState.task_id}
                      onChange={(e) => handleTaskChange(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #10b981', fontSize: '0.82rem', outline: 'none', background: '#ecfdf5', fontWeight: '600', color: '#065f46', boxSizing: 'border-box' }}
                    >
                      <option value="">-- Select Assigned Task --</option>
                      {filteredFormTasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.display_label || t.task_type || t.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Trenching Task"
                      value={formState.title}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Project / Site Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sujangarh HDD Trenching Project"
                    value={formState.site}
                    onChange={(e) => setFormState({ ...formState, site: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Row 2: Basic Info (Date, Category, Subcategory) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.expense_date}
                    onChange={(e) => setFormState({ ...formState, expense_date: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Expense Master Category *
                  </label>
                  <select
                    required
                    value={formState.category_id}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="">-- Select Master Category --</option>
                    {catList.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.payment_type === 'FIXED_MONTHLY' ? ' [Fixed Monthly]' : ' [Actuals]'}
                      </option>
                    ))}
                  </select>
                  {currentFormCategoryObj && (
                    <div style={{ fontSize: '0.7rem', marginTop: '3px', color: '#047857', fontWeight: '500' }}>
                      Type: <strong>{currentFormCategoryObj.payment_type === 'FIXED_MONTHLY' ? 'Fixed Monthly' : 'Actuals / As per Proof'}</strong>
                      {currentFormCategoryObj.requires_proof ? ' • Proof Attachment Required' : ''}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Subcategory
                  </label>
                  <select
                    value={formState.subcategory_id}
                    onChange={(e) => setFormState({ ...formState, subcategory_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="">-- Select Subcategory --</option>
                    {formSubcategoryOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>



              {/* Financial Calculation Box with Dynamic Multi-Item + Button */}
              <div style={{ padding: '14px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#065f46' }}>
                    Automatic Amount Calculation & Line Items
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>
                    {(formState.items || []).length} Entry Item(s)
                  </span>
                </div>

                {/* Line Items Rows */}
                {(formState.items || []).map((item, index) => {
                  const itemCatObj = catList.find(c => String(c.id) === String(item.category_id || formState.category_id));
                  const isFixedMonthly = itemCatObj?.payment_type === 'FIXED_MONTHLY';
                  const itemSubcatOptions = itemCatObj ? ensureArray(itemCatObj.subcategories) : [];

                  return (
                    <div key={item.id || index} style={{ padding: '12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      
                      {/* Row 1: Category, Subcategory & Entry Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '10px', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>
                            Category *
                          </label>
                          <select
                            value={item.category_id || formState.category_id || ''}
                            onChange={(e) => handleLineItemCategoryChange(item.id, e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                          >
                            <option value="">-- Select Category --</option>
                            {catList.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.payment_type === 'FIXED_MONTHLY' ? ' [Fixed Monthly]' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>
                            Subcategory
                          </label>
                          <select
                            value={item.subcategory_id || ''}
                            onChange={(e) => handleUpdateItemRow(item.id, 'subcategory_id', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                          >
                            <option value="">-- Select Subcategory --</option>
                            {itemSubcatOptions.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: '600', color: '#065f46' }}>
                              Item / Entry Details
                            </label>
                            {isFixedMonthly && (
                              <span style={{ fontSize: '0.64rem', padding: '1px 5px', background: '#eff6ff', color: '#1e40af', borderRadius: '3px', border: '1px solid #bfdbfe', fontWeight: '600' }}>
                                Fixed Monthly
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder={`Entry #${index + 1} item name...`}
                            value={item.description || ''}
                            onChange={(e) => handleUpdateItemRow(item.id, 'description', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      {/* Row 2: Quantity, Unit, Rate, Discount, GST, Action */}
                      <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr 0.8fr 1fr 32px', gap: '8px', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>
                            Quantity {isFixedMonthly ? '(Fixed)' : ''}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            readOnly={isFixedMonthly}
                            disabled={isFixedMonthly}
                            value={item.quantity}
                            onChange={(e) => !isFixedMonthly && handleUpdateItemRow(item.id, 'quantity', e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
                              background: isFixedMonthly ? '#f3f4f6' : '#ffffff',
                              cursor: isFixedMonthly ? 'not-allowed' : 'text',
                              color: isFixedMonthly ? '#4b5563' : '#111827'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>Unit</label>
                          <select
                            disabled={isFixedMonthly}
                            value={item.unit}
                            onChange={(e) => handleUpdateItemRow(item.id, 'unit', e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', boxSizing: 'border-box',
                              background: isFixedMonthly ? '#f3f4f6' : '#ffffff',
                              cursor: isFixedMonthly ? 'not-allowed' : 'pointer',
                              color: isFixedMonthly ? '#4b5563' : '#111827'
                            }}
                          >
                            <option value="NOS">NOS</option>
                            <option value="Hours">Hours</option>
                            <option value="Litres">Litres</option>
                            <option value="Meters">Meters</option>
                            <option value="Days">Days</option>
                            <option value="KG">KG</option>
                            <option value="Trips">Trips</option>
                            <option value="Lumpsum">Lumpsum</option>
                            <option value="Lot">Lot</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>
                            Rate (₹) {isFixedMonthly ? '(Fixed)' : ''}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            readOnly={isFixedMonthly}
                            disabled={isFixedMonthly}
                            value={item.rate}
                            onChange={(e) => !isFixedMonthly && handleUpdateItemRow(item.id, 'rate', e.target.value)}
                            style={{
                              width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
                              background: isFixedMonthly ? '#f3f4f6' : '#ffffff',
                              cursor: isFixedMonthly ? 'not-allowed' : 'text',
                              color: isFixedMonthly ? '#4b5563' : '#111827'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '600', color: '#065f46', marginBottom: '2px' }}>Discount (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.discount}
                            onChange={(e) => handleUpdateItemRow(item.id, 'discount', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.68rem', fontWeight: '600', color: '#065f46', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', marginBottom: '2px' }}>
                            <input
                              type="checkbox"
                              checked={item.gst_applicable}
                              onChange={(e) => handleUpdateItemRow(item.id, 'gst_applicable', e.target.checked)}
                            />
                            GST
                          </label>
                          {item.gst_applicable ? (
                            <select
                              value={item.gst_percentage}
                              onChange={(e) => handleUpdateItemRow(item.id, 'gst_percentage', e.target.value)}
                              style={{ padding: '3px 4px', borderRadius: '4px', border: '1px solid #a7f3d0', fontSize: '0.72rem', width: '100%' }}
                            >
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>N/A</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '14px' }}>
                          {(formState.items || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(item.id)}
                              title="Remove entry"
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                            >
                              <LucideTrash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* + Add Entry Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    title="Add Entry Item"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      border: '1px solid #10b981',
                      background: '#d1fae5',
                      color: '#047857',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)'
                    }}
                  >
                    <LucidePlus size={18} />
                  </button>
                </div>

                {/* Calculation Output Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.8rem' }}>
                  <span>Basic: <strong>₹{calculatedAmounts.basic_amount}</strong></span>
                  <span>Taxable: <strong>₹{calculatedAmounts.taxable_amount}</strong></span>
                  <span>GST Amt: <strong>₹{calculatedAmounts.gst_amount}</strong></span>
                  <span style={{ fontSize: '1rem', color: '#047857', fontWeight: '800' }}>
                    Total: ₹{calculatedAmounts.total_amount}
                  </span>
                </div>
              </div>

              {/* Invoicing & Attachment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>Invoice Number</label>
                  <input
                    type="text"
                    placeholder="INV-12345"
                    value={formState.invoice_number}
                    onChange={(e) => setFormState({ ...formState, invoice_number: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>Payment Mode</label>
                  <select
                    value={formState.payment_mode}
                    onChange={(e) => setFormState({ ...formState, payment_mode: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.78rem', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CREDIT">Credit / Due</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>Attachment / Bill</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setAttachmentFile(e.target.files[0] || null)}
                    style={{ width: '100%', fontSize: '0.72rem' }}
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>Remarks / Notes</label>
                <textarea
                  rows="2"
                  placeholder="Additional operational remarks..."
                  value={formState.remarks}
                  onChange={(e) => setFormState({ ...formState, remarks: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', pt: '10px', borderTop: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{ padding: '8px 20px', fontSize: '0.82rem' }}
                >
                  {submitting ? 'Saving...' : (editExpense ? 'Update Expense' : 'Save Expense')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* EXPENSE DETAIL MODAL */}
      {detailModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto',
            background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', pb: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                  {detailModalOpen.title}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                  ID: {detailModalOpen.expense_id || `EXP-${detailModalOpen.id}`}
                </span>
              </div>
              <button onClick={() => setDetailModalOpen(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Status Banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>Workflow Status:</span>
                {renderStatusBadge(detailModalOpen.status)}
              </div>

              {/* Financial Calculation Summary Table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f3f4f6', padding: '8px 12px', fontWeight: '700', fontSize: '0.8rem', color: '#111827' }}>
                  Financial Breakdown
                </div>
                <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                  <div>Quantity: <strong>{detailModalOpen.quantity} {detailModalOpen.unit || 'NOS'}</strong></div>
                  <div>Rate: <strong>₹{parseFloat(detailModalOpen.rate || 0).toLocaleString()}</strong></div>
                  <div>Basic Amount: <strong>₹{parseFloat(detailModalOpen.basic_amount || 0).toLocaleString()}</strong></div>
                  <div>Discount: <strong>₹{parseFloat(detailModalOpen.discount || 0).toLocaleString()}</strong></div>
                  <div>Taxable Amount: <strong>₹{parseFloat(detailModalOpen.taxable_amount || 0).toLocaleString()}</strong></div>
                  <div>GST ({detailModalOpen.gst_percentage}%): <strong>₹{parseFloat(detailModalOpen.gst_amount || 0).toLocaleString()}</strong></div>
                  <div style={{ gridColumn: 'span 2', fontSize: '1rem', color: '#047857', fontWeight: '800', pt: '6px', borderTop: '1px solid #e5e7eb' }}>
                    Total Expense Amount: ₹{parseFloat(detailModalOpen.total_amount || detailModalOpen.amount || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Mapping Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
                <div>Category: <strong>{detailModalOpen.category_name || detailModalOpen.category}</strong></div>
                <div>Subcategory: <strong>{detailModalOpen.subcategory_name || detailModalOpen.subcategory || 'N/A'}</strong></div>
                <div>Vendor: <strong>{detailModalOpen.vendor_name || 'Direct'}</strong></div>
                <div>Machine: <strong>{detailModalOpen.machine_name || 'N/A'}</strong></div>
                <div>Task: <strong>{detailModalOpen.task_title || 'N/A'}</strong></div>
                <div>Site: <strong>{detailModalOpen.site || 'N/A'}</strong></div>
              </div>

              {/* Supplier & Invoice */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.78rem', background: '#f9fafb', padding: '10px', borderRadius: '6px' }}>
                <div>Supplier: <strong>{detailModalOpen.supplier_name || 'N/A'}</strong></div>
                <div>Invoice No: <strong>{detailModalOpen.invoice_number || 'N/A'}</strong></div>
                <div>Payment Mode: <strong>{detailModalOpen.payment_mode || 'CASH'}</strong></div>
              </div>

              {/* Attachment Preview / Link */}
              {detailModalOpen.attachment_url && (
                <div style={{ padding: '10px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.8rem' }}>
                  <strong>Attachment File: </strong>
                  <a href={detailModalOpen.attachment_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: '600', textDecoration: 'underline', marginLeft: '6px' }}>
                    View Uploaded Invoice / Receipt File
                  </a>
                </div>
              )}

              {/* Rejection Reason if any */}
              {detailModalOpen.rejection_reason && (
                <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '0.8rem' }}>
                  <strong>Rejection Reason: </strong> {detailModalOpen.rejection_reason}
                </div>
              )}

              {/* Action Bar inside Detail Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', pt: '12px', borderTop: '1px solid #e5e7eb' }}>
                {detailModalOpen.status === 'DRAFT' && (
                  <button
                    onClick={() => handleSubmitWorkflow(detailModalOpen)}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                  >
                    Submit for Approval
                  </button>
                )}

                {detailModalOpen.status === 'SUBMITTED' && (isAdmin || hasRole('MANAGER') || hasRole('PROJECT_MANAGER')) && (
                  <>
                    <button
                      onClick={() => handleApproveWorkflow(detailModalOpen)}
                      className="btn-primary"
                      style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#10b981', borderColor: '#10b981' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectModalOpen(detailModalOpen); setRejectionReason(''); }}
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '0.82rem', color: '#ef4444', borderColor: '#ef4444' }}
                    >
                      Reject
                    </button>
                  </>
                )}

                {detailModalOpen.status === 'APPROVED' && (isAdmin || hasRole('FINANCE') || hasRole('MANAGER')) && (
                  <button
                    onClick={() => { setPayModalOpen(detailModalOpen); setPaymentForm({ payment_mode: detailModalOpen.payment_mode || 'CASH', payment_reference: '' }); }}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  >
                    Mark Paid
                  </button>
                )}

                <button
                  onClick={() => setDetailModalOpen(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', background: '#fff', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#b91c1c', marginBottom: '10px' }}>
              Reject Expense ({rejectModalOpen.expense_id || rejectModalOpen.id})
            </h3>
            <form onSubmit={handleRejectWorkflowSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                  Reason for Rejection *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="State the reason for rejecting this expense..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setRejectModalOpen(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#ef4444', borderColor: '#ef4444' }}>
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAY MODAL */}
      {payModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', background: '#fff', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#6d28d9', marginBottom: '10px' }}>
              Mark Expense as Paid ({payModalOpen.expense_id || payModalOpen.id})
            </h3>
            <form onSubmit={handlePayWorkflowSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                  Payment Mode
                </label>
                <select
                  value={paymentForm.payment_mode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CREDIT">Credit Settlement</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                  Payment Reference / Transaction ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR12345678 or Cheque #99102"
                  value={paymentForm.payment_reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_reference: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setPayModalOpen(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                  Mark Paid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERATE MONTHLY FIXED EXPENSES MODAL */}
      {genMonthlyModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', pb: '10px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e40af', margin: 0 }}>
                Generate Monthly Fixed Expenses
              </h3>
              <button onClick={() => setGenMonthlyModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>

            <p style={{ fontSize: '0.78rem', color: '#4b5563', marginBottom: '14px' }}>
              Automatically generate monthly fixed expense transactions for all active Expense Master items marked as <strong>FIXED_MONTHLY</strong> (e.g. Water Charges, Fuel Transport, Warehouse).
            </p>

            <form onSubmit={handleGenerateMonthlySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Select Month *
                  </label>
                  <select
                    required
                    value={genMonthlyForm.month}
                    onChange={(e) => setGenMonthlyForm({ ...genMonthlyForm, month: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', background: '#fff' }}
                  >
                    {[
                      { v: 1, label: 'January' }, { v: 2, label: 'February' }, { v: 3, label: 'March' },
                      { v: 4, label: 'April' }, { v: 5, label: 'May' }, { v: 6, label: 'June' },
                      { v: 7, label: 'July' }, { v: 8, label: 'August' }, { v: 9, label: 'September' },
                      { v: 10, label: 'October' }, { v: 11, label: 'November' }, { v: 12, label: 'December' }
                    ].map(m => (
                      <option key={m.v} value={m.v}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Select Year *
                  </label>
                  <input
                    type="number"
                    required
                    min="2020"
                    max="2035"
                    value={genMonthlyForm.year}
                    onChange={(e) => setGenMonthlyForm({ ...genMonthlyForm, year: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {isAdmin && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    Target Vendor (Optional for Admin)
                  </label>
                  <select
                    value={genMonthlyForm.vendor_id}
                    onChange={(e) => setGenMonthlyForm({ ...genMonthlyForm, vendor_id: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', outline: 'none', background: '#fff' }}
                  >
                    <option value="">-- System Wide / All Permitted Vendors --</option>
                    {venList.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', pt: '10px', borderTop: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  onClick={() => setGenMonthlyModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generatingMonthly}
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '0.8rem', background: '#2563eb', borderColor: '#2563eb' }}
                >
                  {generatingMonthly ? 'Generating...' : 'Run Monthly Generator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};


export default Expenses;
