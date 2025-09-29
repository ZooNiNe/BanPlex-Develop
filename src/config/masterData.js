import { projectsCol, fundingCreditorsCol, opCatsCol, otherCatsCol, suppliersCol, professionsCol, workersCol, staffCol, materialsCol } from './firebase.js';

export const masterDataConfig = {
    'projects': {
        collection: projectsCol,
        stateKey: 'projects',
        nameField: 'projectName',
        title: 'Proyek'
    },
    'creditors': {
        collection: fundingCreditorsCol,
        stateKey: 'fundingCreditors',
        nameField: 'creditorName',
        title: 'Kreditur'
    },
    'op-cats': {
        collection: opCatsCol,
        stateKey: 'operationalCategories',
        nameField: 'categoryName',
        title: 'Kategori Operasional'
    },
    'other-cats': {
        collection: otherCatsCol,
        stateKey: 'otherCategories',
        nameField: 'categoryName',
        title: 'Kategori Lainnya'
    },
    'suppliers': {
        collection: suppliersCol,
        stateKey: 'suppliers',
        nameField: 'supplierName',
        title: 'Supplier'
    },
    'professions': {
        collection: professionsCol,
        stateKey: 'professions',
        nameField: 'professionName',
        title: 'Profesi'
    },
    'workers': {
        collection: workersCol,
        stateKey: 'workers',
        nameField: 'workerName',
        title: 'Pekerja'
    },
    'staff': {
        collection: staffCol,
        stateKey: 'staff',
        nameField: 'staffName',
        title: 'Staf Inti'
    },
    'materials': {
        collection: materialsCol,
        stateKey: 'materials',
        nameField: 'materialName',
        title: 'Material'
    },
};