
    'use strict';

    // Local catalog is retained as a safe fallback if Supabase cannot be reached.
    let products = [
      {id:1,name:'GENMERCH Classic Logo T-Shirt — Black',price:499,sold:'Demo item',icon:'👕',cat:'T-Shirts',off:'DEMO',desc:'Classic everyday T-shirt demo in black. Suggested sizes: S, M, L, XL, and XXL. Regular fit.'},
      {id:2,name:'Suot Apparel Oversized T-Shirt — White',price:599,sold:'Demo item',icon:'👕',cat:'T-Shirts',off:'DEMO',desc:'Relaxed oversized white T-shirt demo with a clean streetwear silhouette. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:3,name:'GENMERCH Graphic T-Shirt — Orange',price:549,sold:'Demo item',icon:'👕',cat:'T-Shirts',off:'DEMO',desc:'Bright graphic T-shirt demo for casual outfits. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:4,name:'Suot Apparel Premium Cotton Tee — Sand',price:649,sold:'Demo item',icon:'👕',cat:'T-Shirts',off:'DEMO',desc:'Premium-look sand color cotton T-shirt demo. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:5,name:'GENMERCH Heavyweight Boxy T-Shirt — Charcoal',price:699,sold:'Demo item',icon:'👕',cat:'T-Shirts',off:'DEMO',desc:'Heavyweight boxy-fit charcoal T-shirt demo for a structured streetwear look. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:6,name:'Suot Apparel Everyday Shorts — Black',price:399,sold:'Demo item',icon:'🩳',cat:'Shorts',off:'DEMO',desc:'Everyday black shorts demo with an easy casual fit. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:7,name:'GENMERCH Active Mesh Shorts — Gray',price:449,sold:'Demo item',icon:'🩳',cat:'Shorts',off:'DEMO',desc:'Lightweight gray activewear shorts demo. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:8,name:'Suot Apparel Cargo Utility Shorts — Olive',price:699,sold:'Demo item',icon:'🩳',cat:'Shorts',off:'DEMO',desc:'Olive cargo shorts demo with a practical streetwear style. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:9,name:'GENMERCH Relaxed Denim Shorts — Blue',price:749,sold:'Demo item',icon:'🩳',cat:'Shorts',off:'DEMO',desc:'Blue relaxed-fit denim shorts demo for casual daily wear. Suggested sizes: S, M, L, XL, and XXL.'},
      {id:10,name:'Suot Apparel Drawstring Lounge Shorts — Navy',price:379,sold:'Demo item',icon:'🩳',cat:'Shorts',off:'DEMO',desc:'Navy drawstring lounge shorts demo designed for a comfortable casual fit. Suggested sizes: S, M, L, XL, and XXL.'}
    ];
    const LOCAL_DEMO_PRODUCTS = products.map(product => ({ ...product }));

    let cart = [];
    let currentCategory = 'All';
    let catalogCategoryOrder = [];
    let selectedPayment = 'COD';
    let toastTimer;
    let pendingSizeProductId = null;
    let pendingSelectedSize = '';
    let pendingSelectedVariantId = null;
    let openProductSelectedColor = '';
    let openProductDetailId = null;
    let openProductGalleryProduct = null;
    let openProductGalleryImages = [];
    let openProductGalleryThumbnails = null;
    let openProductGallerySwipeIndexes = [];
    let openProductGalleryIndex = 0;
    let productGallerySwipeStart = null;
    let productGallerySuppressClickUntil = 0;
    let productSwipeHintTimer = null;
    let productSwipeHintHideTimer = null;
    let productDetailSelectedSize = '';
    let productDetailSelectedVariantId = null;
    let productDetailSelectedColor = '';
    let productDetailColorConfirmed = false;
    let productOptionValidationAttempted = false;
    let productDetailQuantity = 1;
    let productOptionsExpanded = false;
    let catalogLoadState = 'loading';
    const GENMERCH_CATALOG_CACHE_KEY = 'genmerch.catalog.snapshot.v1';
    const GENMERCH_CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;
    function restoreCatalogFromCache(){
      try{
        const raw=sessionStorage.getItem(GENMERCH_CATALOG_CACHE_KEY);
        if(!raw)return false;
        const cached=JSON.parse(raw);
        if(!cached||!Array.isArray(cached.products)||!cached.products.length)return false;
        const age=Date.now()-Number(cached.savedAt||0);
        if(!Number.isFinite(age)||age<0||age>GENMERCH_CATALOG_CACHE_TTL_MS)return false;
        const safeProducts=cached.products.filter(product=>product&&typeof product==='object'&&product.id!==undefined&&product.name);
        if(!safeProducts.length)return false;
        products.splice(0,products.length,...safeProducts);
        catalogLoadState='connected';
        return true;
      }catch(_){return false;}
    }
    function persistCatalogToCache(mappedProducts){
      try{
        sessionStorage.setItem(GENMERCH_CATALOG_CACHE_KEY,JSON.stringify({savedAt:Date.now(),products:mappedProducts}));
      }catch(error){
        // The live catalogue remains usable if browser storage is full or unavailable.
        console.warn('GENMERCH catalogue cache was not saved in this tab.',error);
      }
    }

    const $ = id => document.getElementById(id);
    const money = value => '₱' + Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    const displaySizeLabel = size => ({
      'Small':'S',
      'Medium':'M',
      'Large':'L',
      'Extra Size':'XL',
      'Free Size':'Free Size'
    }[String(size || '')] || String(size || ''));
    // Browser-safe Supabase publishable key only. Never add a service-role/secret key here.
    const GENMERCH_SUPABASE_URL = 'https://csbaxyzfcaxhyyzxfxjw.supabase.co';
    const GENMERCH_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4k2dHjjZu6AD4OsV2J8eow_AlhBl_7j';
    async function fetchSupabaseTable(table, query) {
      const response = await fetch(GENMERCH_SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
        method: 'GET', mode: 'cors', credentials: 'omit',
        headers: { apikey: GENMERCH_SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' }
      });
      if (!response.ok) { const details = await response.text().catch(() => ''); throw new Error('Supabase ' + table + ' request failed (' + response.status + '): ' + details.slice(0,180)); }
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Unexpected Supabase response for ' + table);
      return data;
    }
    function safeCatalogImageUrl(value) {
      try { const url = new URL(String(value || '')); return ['https:','http:'].includes(url.protocol) ? url.href : ''; }
      catch (_) { return ''; }
    }
    async function loadSupabaseCatalog() {
      const result = await Promise.all([
        fetchSupabaseTable('categories','select=id,name,slug,is_active,sort_order&is_active=eq.true&order=sort_order.asc'),
        fetchSupabaseTable('products','select=id,category_id,name,slug,sku,description,base_price,compare_at_price,regular_price,promotion_type,promotion_value,is_active,is_deleted,is_demo,is_featured,created_at&is_active=eq.true&is_deleted=eq.false&order=created_at.asc,id.asc'),
        fetchSupabaseTable('product_variants','select=id,product_id,sku,size_label,color_label,price_override,stock_quantity,is_active&is_active=eq.true'),
        fetchSupabaseTable('product_images','select=id,product_id,image_url,alt_text,sort_order,is_primary,color_label&order=sort_order.asc')
      ]);
      const categoryRows=result[0], productRows=result[1], variantRows=result[2], imageRows=result[3];
      catalogCategoryOrder = categoryRows.map(row => String(row.name || '').trim()).filter(Boolean);
      const categoryById=new Map(categoryRows.map(row=>[String(row.id),row.name||'Other']));
      const variantsByProduct=new Map(), imagesByProduct=new Map();
      variantRows.forEach(row=>{const k=String(row.product_id);if(!variantsByProduct.has(k))variantsByProduct.set(k,[]);variantsByProduct.get(k).push({id:String(row.id),sku:row.sku||'',size:String(row.size_label||'One Size'),color:String(row.color_label||''),price:row.price_override===null||row.price_override===undefined?null:Number(row.price_override),stock:Math.max(0,Math.floor(Number(row.stock_quantity)||0))});});
      imageRows.forEach(row=>{const k=String(row.product_id);if(!imagesByProduct.has(k))imagesByProduct.set(k,[]);imagesByProduct.get(k).push(row);});
      const mapped=productRows.map(row=>{
        const category=categoryById.get(String(row.category_id))||'Other';
        const variants=(variantsByProduct.get(String(row.id))||[]).slice().sort((a,b)=>a.size.localeCompare(b.size));
        const imgs=(imagesByProduct.get(String(row.id))||[]).slice().sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
        const primary=imgs.find(image=>image.is_primary)||imgs[0]||null;
        const totalStock=variants.reduce((sum,v)=>sum+v.stock,0), isDemo=row.is_demo===true;
        const promoType=String(row.promotion_type||'none'),promoValue=Number(row.promotion_value)||0,regularPrice=Number(row.regular_price)||Number(row.compare_at_price)||Number(row.base_price)||0;const promoLabel=promoType==='percent'&&promoValue>0?promoValue+'% OFF':promoType==='free_shipping_metro'?'FREE SHIPPING · METRO MANILA':promoType==='free_delivery_metro'?'FREE DELIVERY · METRO MANILA':(isDemo?'DEMO':(row.is_featured?'FEATURED':'NEW'));return {id:String(row.id),sku:String(row.sku||''),name:String(row.name||'Unnamed product'),price:Number(row.base_price)||0,regularPrice:regularPrice,promotionType:promoType,promotionValue:promoValue,promotionLabel:promoLabel,sold:totalStock>0?(isDemo?'Demo Only':'In stock'):'Out of stock',icon:category==='Shorts'?'🩳':'👕',cat:category,off:promoLabel,desc:String(row.description||(isDemo?'Demo Only':'Product details coming soon.')),image:safeCatalogImageUrl(primary&&primary.image_url),imageAlt:String((primary&&primary.alt_text)||row.name||'GENMERCH product'),images:imgs.map(image=>({url:safeCatalogImageUrl(image.image_url),alt:String(image.alt_text||row.name||'GENMERCH product'),colorLabel:String(image.color_label||'').trim()})).filter(image=>image.url),isDemo:isDemo,totalStock:totalStock,variants:variants};
      });
      products.splice(0,products.length,...mapped);
      catalogLoadState='connected';
      persistCatalogToCache(mapped);
      return mapped.length;
    }

    // Refresh live inventory without forcing every caller to block or repaint the storefront.
    let liveCatalogRefreshPromise = null;
    const productStockRefreshPromises = new Map();
    const productStockRefreshTimes = new Map();
    function refreshProductVariantsInBackground(productId){
      const id=String(productId||'');
      if(!id)return Promise.resolve(false);
      const existing=productStockRefreshPromises.get(id);
      if(existing)return existing;
      const lastRefresh=productStockRefreshTimes.get(id)||0;
      if(Date.now()-lastRefresh<15000)return Promise.resolve(true);
      if(catalogLoadState!=='connected')return Promise.resolve(false);
      const query='select=id,product_id,sku,size_label,color_label,price_override,stock_quantity,is_active&is_active=eq.true&product_id=eq.'+encodeURIComponent(id);
      const productQuery='select=id,base_price,compare_at_price,regular_price,promotion_type,promotion_value,is_demo,is_active,is_deleted&id=eq.'+encodeURIComponent(id);
      const task=Promise.all([
        fetchSupabaseTable('product_variants',query),
        fetchSupabaseTable('products',productQuery)
      ]).then(([rows,productRows])=>{
        const product=products.find(item=>String(item.id)===id);
        if(!product)return false;
        const currentProduct=productRows[0];
        if(!currentProduct||currentProduct.is_active!==true||currentProduct.is_deleted===true){
          product.variants=[];
          product.totalStock=0;
          product.sold='Out of stock';
        }else{
          product.price=Number(currentProduct.base_price)||0;
          product.regularPrice=Number(currentProduct.regular_price)||Number(currentProduct.compare_at_price)||Number(currentProduct.base_price)||0;
          product.promotionType=String(currentProduct.promotion_type||'none');
          product.promotionValue=Number(currentProduct.promotion_value)||0;
          product.isDemo=currentProduct.is_demo===true;
          const variants=rows.map(row=>({
            id:String(row.id),
            sku:row.sku||'',
            size:String(row.size_label||'One Size'),
            color:String(row.color_label||''),
            price:row.price_override===null||row.price_override===undefined?null:Number(row.price_override),
            stock:Math.max(0,Math.floor(Number(row.stock_quantity)||0))
          })).sort((a,b)=>a.size.localeCompare(b.size));
          product.variants=variants;
          product.totalStock=variants.reduce((sum,variant)=>sum+variant.stock,0);
          product.sold=product.totalStock>0?(product.isDemo?'Demo Only':'In stock'):'Out of stock';
        }
        productStockRefreshTimes.set(id,Date.now());
        if(String(openProductDetailId)===id&&$('productOverlay')&&$('productOverlay').classList.contains('open')){
          renderProductModalSizes(product);
          updateProductModalAddButton(product);
        }
        return true;
      }).catch(error=>{
        console.warn('GENMERCH targeted product stock refresh failed; the last catalogue snapshot remains available.',error);
        return false;
      }).finally(()=>{
        if(productStockRefreshPromises.get(id)===task)productStockRefreshPromises.delete(id);
      });
      productStockRefreshPromises.set(id,task);
      return task;
    }
    async function refreshCatalogForLiveStock(renderUI=true) {
      const pending = liveCatalogRefreshPromise || (liveCatalogRefreshPromise = loadSupabaseCatalog());
      try {
        await pending;
        if (renderUI) {
          renderCategoryFilters();
          renderProducts();
        }
        return true;
      } finally {
        if (liveCatalogRefreshPromise === pending) liveCatalogRefreshPromise = null;
      }
    }

    let genmerchHardReloadPromise = null;
    window.performGenmerchHardReload = async function(button) {
      if(genmerchHardReloadPromise)return genmerchHardReloadPromise;
      const target=button instanceof HTMLElement?button:null;
      let navigated=false;
      if(target){
        target.disabled=true;
        target.setAttribute('aria-busy','true');
        target.classList.add('is-loading');
        const label=target.querySelector('.genmerch-hard-reload-label');
        if(label)label.textContent='Reloading…';
      }
      const task=(async function(){
        try{
          if(!saveDraftState())throw new Error('Your cart or checkout draft could not be saved in this browser. Reload was stopped to protect your changes.');
          try{
            sessionStorage.setItem('genmerch.lastHardReloadNotice',JSON.stringify({
              refreshedAt:new Date().toISOString(),
              warning:'Your storefront is refreshing now; catalogue and account data will sync in the background.'
            }));
          }catch(_){}
          const nextUrl=new URL(window.location.href);
          nextUrl.searchParams.set('_gm_reload',String(Date.now()));
          navigated=true;
          window.location.replace(nextUrl.toString());
          return true;
        }catch(error){
          console.error('GENMERCH Reload could not complete.',error);
          showToast('Reload stopped: '+(error&&error.message?error.message:'Unable to save the current cart.'));
          return false;
        }
      })();
      genmerchHardReloadPromise=task;
      try{return await task;}
      finally{
        if(genmerchHardReloadPromise===task)genmerchHardReloadPromise=null;
        if(target&&!navigated){
          target.disabled=false;
          target.removeAttribute('aria-busy');
          target.classList.remove('is-loading');
          const label=target.querySelector('.genmerch-hard-reload-label');
          if(label)label.textContent='Reload';
        }
      }
    };

    // Best-effort persistent draft storage for this browser/device. Cross-device sync requires a secure backend/account.
    const GENMERCH_DRAFT_STORAGE_KEY = 'genmerch.customerDraft.v1';
    const GENMERCH_DRAFT_OWNER_KEY = 'genmerch.customerDraft.ownerUserId.v1';
    const GENMERCH_DRAFT_UPDATED_AT_KEY = 'genmerch.customerDraft.updatedAt.v1';
    let checkoutValidationAttempted=false;
    const GENMERCH_DRAFT_FIELD_IDS = [
      'custName', 'firstName', 'lastName', 'custPhone', 'streetAddress', 'province', 'city', 'barangay',
      'postalCode', 'landmark', 'specialInstructions'
    ];
    function syncCheckoutFullName(){
      const first=String($('firstName')&&$('firstName').value||'').trim().replace(/\s+/g,' ');
      const last=String($('lastName')&&$('lastName').value||'').trim().replace(/\s+/g,' ');
      const full=$('custName');
      if(full)full.value=[first,last].filter(Boolean).join(' ');
      return full?full.value:'';
    }
    function isValidCheckoutNamePart(value){
      const normalized=String(value||'').trim().replace(/\s+/g,' ');
      if(!normalized||normalized.length>80)return false;
      const words=normalized.split(' ');
      return words.every(word=>
        /^[\p{L}\p{M}]+(?:[’'.-][\p{L}\p{M}]+)*\.?$/u.test(word)&&
        [...word.matchAll(/\p{L}/gu)].length>=2
      );
    }
    const GENMERCH_ALLOWED_SIZES = ['Small', 'Medium', 'Large', 'Free Size', 'Extra Size'];
    let isRestoringDraft = false;
    let draftStorageAvailable = true;
    let customerDraftCloudReadyUserId = '';
    let customerDraftCloudSaveTimer = null;
    let customerDraftCloudSaveInFlight = null;
    let customerDraftCloudSyncPromise = null;
    let customerDraftCloudSyncUserId = '';

    function setDraftSaveStatus(message, isError = false) {
      const status = $('draftSaveStatus');
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('error', Boolean(isError));
    }

    function compactAddressRecord(record) {
      if (!record || typeof record !== 'object') return null;
      const compact = {};
      const textKeys = [
        'id', 'level', 'name_en', 'name_local', 'slug', 'parent_id',
        'parent_name_en', 'parent_name_local', 'region_id', 'region_code',
        'parent_region_id', 'region_name_en', 'region_name', 'postal_code'
      ];
      textKeys.forEach(key => {
        if (typeof record[key] === 'string' || typeof record[key] === 'number') compact[key] = record[key];
      });
      if (typeof record.name === 'string') compact.name = record.name;
      else if (record.name && typeof record.name === 'object') {
        compact.name = {};
        ['en', 'local', 'slug'].forEach(key => {
          if (typeof record.name[key] === 'string') compact.name[key] = record.name[key];
        });
      }
      if (Array.isArray(record.zip_codes)) compact.zip_codes = record.zip_codes.map(String).filter(code => /^\d{4}$/.test(code)).slice(0, 10);
      if (record.parent && typeof record.parent === 'object') compact.parent = compactAddressRecord(record.parent);
      if (record.region && typeof record.region === 'object') compact.region = compactAddressRecord(record.region);
      if (Array.isArray(record.ancestors)) {
        compact.ancestors = record.ancestors.slice(0, 4).map(item => compactAddressRecord(item)).filter(Boolean);
      }
      return compact;
    }

    function buildDraftSnapshot() {
      const form = {};
      GENMERCH_DRAFT_FIELD_IDS.forEach(id => {
        const field = $(id);
        form[id] = field ? String(field.value || '').slice(0, 2000) : '';
      });
      return {
        schemaVersion: 1,
        cart: cart.slice(0, 100).map(item => ({
          id: String(item.id),
          variantId: item.variantId ? String(item.variantId) : null,
          size: String(item.size || ''),
          qty: Math.max(1, Math.min(999, Math.floor(Number(item.qty) || 1)))
        })),
        form,
        addressReference: {
          province: compactAddressRecord(selectedProvinceRecord),
          city: compactAddressRecord(selectedCityRecord),
          barangay: compactAddressRecord(selectedBarangayRecord)
        },
        selectedPayment: ['COD', 'GCash', 'Maya', 'Bank Transfer'].includes(selectedPayment) ? selectedPayment : 'COD'
      };
    }

    function saveDraftState() {
      if (isRestoringDraft) return true;
      try {
        const serialized = JSON.stringify(buildDraftSnapshot());
        const previous = localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY);
        const changed = previous !== serialized;
        if (changed) {
          localStorage.setItem(GENMERCH_DRAFT_STORAGE_KEY, serialized);
          localStorage.setItem(GENMERCH_DRAFT_UPDATED_AT_KEY, String(Date.now()));
        }
        const userId=customerAuthCurrentSession&&customerAuthCurrentSession.user&&customerAuthCurrentSession.user.id?String(customerAuthCurrentSession.user.id):'';
        if(userId&&customerDraftCloudReadyUserId===userId){
          try{localStorage.setItem(GENMERCH_DRAFT_OWNER_KEY,userId);}catch(_){}
          if(changed)scheduleCustomerDraftCloudSave();
          setDraftSaveStatus('✓ Cart and checkout details saved; syncing to your account…');
        }else{
          setDraftSaveStatus('✓ Cart and details saved in this browser.');
        }
        draftStorageAvailable = true;
        return true;
      } catch (error) {
        draftStorageAvailable = false;
        setDraftSaveStatus('Autosave is unavailable in this browser. Keep this page open or enable browser storage.', true);
        return false;
      }
    }

    function parseCustomerDraftSnapshot(raw){
      if(!raw)return null;
      try{
        const parsed=JSON.parse(raw);
        return parsed&&typeof parsed==='object'&&parsed.schemaVersion===1?parsed:null;
      }catch(_){return null;}
    }
    function hasMeaningfulCustomerDraft(snapshot){
      if(!snapshot||typeof snapshot!=='object')return false;
      if(Array.isArray(snapshot.cart)&&snapshot.cart.length>0)return true;
      const form=snapshot.form&&typeof snapshot.form==='object'?snapshot.form:{};
      if(Object.values(form).some(value=>String(value||'').trim()!==''))return true;
      if(snapshot.selectedPayment&&snapshot.selectedPayment!=='COD')return true;
      const refs=snapshot.addressReference&&typeof snapshot.addressReference==='object'?snapshot.addressReference:{};
      return Boolean(refs.province||refs.city||refs.barangay);
    }
    async function upsertCustomerDraftCloud(userId,snapshot){
      const client=getCustomerAuthClient();
      const updatedAt=new Date().toISOString();
      const snapshotSerialized=JSON.stringify(snapshot);
      const result=await client.from('customer_saved_state').upsert(
        {user_id:userId,draft_state:snapshot,updated_at:updatedAt},
        {onConflict:'user_id'}
      );
      if(result.error)throw result.error;
      try{
        localStorage.setItem(GENMERCH_DRAFT_OWNER_KEY,userId);
        if(localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY)===snapshotSerialized){
          localStorage.setItem(GENMERCH_DRAFT_UPDATED_AT_KEY,String(new Date(updatedAt).getTime()));
          setDraftSaveStatus('✓ Cart and checkout details synced to your account.');
        }else{
          scheduleCustomerDraftCloudSave();
        }
      }catch(_){}
    }
    async function saveCustomerDraftCloud(userId){
      if(!userId||customerDraftCloudReadyUserId!==userId)return;
      const currentUser=customerAuthCurrentSession&&customerAuthCurrentSession.user?String(customerAuthCurrentSession.user.id):'';
      if(currentUser!==userId)return;
      const owner=localStorage.getItem(GENMERCH_DRAFT_OWNER_KEY)||'';
      if(owner&&owner!==userId)return;
      if(customerDraftCloudSaveInFlight){
        await customerDraftCloudSaveInFlight;
        if(customerDraftCloudReadyUserId!==userId)return;
      }
      const snapshot=parseCustomerDraftSnapshot(localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY));
      if(!snapshot)return;
      const savePromise=upsertCustomerDraftCloud(userId,snapshot);
      customerDraftCloudSaveInFlight=savePromise;
      try{await savePromise;}
      finally{if(customerDraftCloudSaveInFlight===savePromise)customerDraftCloudSaveInFlight=null;}
    }
    function scheduleCustomerDraftCloudSave(){
      const userId=customerAuthCurrentSession&&customerAuthCurrentSession.user&&customerAuthCurrentSession.user.id?String(customerAuthCurrentSession.user.id):'';
      if(!userId||customerDraftCloudReadyUserId!==userId)return;
      if(customerDraftCloudSaveTimer!==null)window.clearTimeout(customerDraftCloudSaveTimer);
      customerDraftCloudSaveTimer=window.setTimeout(()=>{
        customerDraftCloudSaveTimer=null;
        saveCustomerDraftCloud(userId).catch(error=>{
          console.warn('GENMERCH customer draft cloud sync failed.',error);
          setDraftSaveStatus('Saved on this device, but cloud sync failed. Check your connection and try again.',true);
        });
      },650);
    }
    function mergeCustomerDraftSnapshots(localSnapshot,cloudSnapshot,preferLocal){
      const local=localSnapshot&&typeof localSnapshot==='object'?localSnapshot:{};
      const cloud=cloudSnapshot&&typeof cloudSnapshot==='object'?cloudSnapshot:{};
      const localForm=local.form&&typeof local.form==='object'?local.form:{};
      const cloudForm=cloud.form&&typeof cloud.form==='object'?cloud.form:{};
      const form={};
      GENMERCH_DRAFT_FIELD_IDS.forEach(id=>{
        const lv=String(localForm[id]||''),cv=String(cloudForm[id]||'');
        form[id]=preferLocal?(lv.trim()?lv:cv):(cv.trim()?cv:lv);
      });
      const localAddress=local.addressReference&&typeof local.addressReference==='object'?local.addressReference:{};
      const cloudAddress=cloud.addressReference&&typeof cloud.addressReference==='object'?cloud.addressReference:{};
      const addressReference={};
      ['province','city','barangay'].forEach(key=>{addressReference[key]=preferLocal?(localAddress[key]||cloudAddress[key]||null):(cloudAddress[key]||localAddress[key]||null);});
      const localCart=Array.isArray(local.cart)?local.cart:[];
      const cloudCart=Array.isArray(cloud.cart)?cloud.cart:[];
      const first=preferLocal?localCart:cloudCart,second=preferLocal?cloudCart:localCart;
      const mergedCart=[],seen=new Set();
      const addLines=items=>items.forEach(item=>{
        if(!item||!item.id)return;
        const id=String(item.id),size=String(item.size||''),variantId=String(item.variantId||'');
        const key=variantId?'variant:'+variantId:'product:'+id+':'+size;
        if(seen.has(key))return;
        seen.add(key);
        mergedCart.push({id,variantId:variantId||null,size,qty:Math.max(1,Math.min(999,Math.floor(Number(item.qty)||1)))});
      });
      addLines(first);addLines(second);
      const localPayment=['COD','GCash','Maya','Bank Transfer'].includes(local.selectedPayment)?local.selectedPayment:'COD';
      const cloudPayment=['COD','GCash','Maya','Bank Transfer'].includes(cloud.selectedPayment)?cloud.selectedPayment:'COD';
      const selectedPayment=preferLocal?(localPayment!=='COD'?localPayment:cloudPayment):(cloudPayment!=='COD'?cloudPayment:localPayment);
      return {schemaVersion:1,cart:mergedCart.slice(0,100),form,addressReference,selectedPayment};
    }
    async function syncCustomerDraftForSession(session,applyToUI=false){
      const resolveSession=arguments.length===0||arguments[0]===undefined;
      if(resolveSession){
        try{
          const client=getCustomerAuthClient(),sessionResult=await client.auth.getSession();
          if(sessionResult.error)throw sessionResult.error;
          session=sessionResult.data&&sessionResult.data.session?sessionResult.data.session:null;
          customerAuthCurrentSession=session&&session.user?session:null;
        }catch(error){
          console.warn('GENMERCH could not resolve the current customer session for draft sync.',error);
          return false;
        }
      }
      const userId=session&&session.user&&session.user.id?String(session.user.id):'';
      if(!userId){customerDraftCloudReadyUserId='';return false;}
      if(customerDraftCloudSyncPromise&&customerDraftCloudSyncUserId===userId){
        try{await customerDraftCloudSyncPromise;}catch(_){}
        if(applyToUI&&customerDraftCloudReadyUserId===userId){
          restoreDraftState();
          await restoreAddressReferenceContext();
          updateCart();
        }
        return customerDraftCloudReadyUserId===userId;
      }
      customerDraftCloudSyncUserId=userId;
      const syncPromise=(async()=>{
        const client=getCustomerAuthClient();
        let owner='';
        let localRaw='';
        let localSnapshot=null;
        let localUpdatedAt=0;
        try{
          owner=localStorage.getItem(GENMERCH_DRAFT_OWNER_KEY)||'';
          localRaw=localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY)||'';
          localSnapshot=parseCustomerDraftSnapshot(localRaw);
          localUpdatedAt=Number(localStorage.getItem(GENMERCH_DRAFT_UPDATED_AT_KEY))||0;
        }catch(error){throw new Error('Browser draft storage is unavailable. Please enable browser storage before syncing.');}
        const localBelongsToUser=!owner||owner===userId;
        const cloudResult=await client.from('customer_saved_state').select('draft_state,updated_at').eq('user_id',userId).maybeSingle();
        if(cloudResult.error)throw cloudResult.error;
        // Re-read local state after the network round trip so a customer typing or adding items
        // while startup sync is running always wins over an older cloud snapshot.
        try{
          const newestRaw=localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY)||'';
          const newestUpdatedAt=Number(localStorage.getItem(GENMERCH_DRAFT_UPDATED_AT_KEY))||0;
          if(newestUpdatedAt>localUpdatedAt){
            owner=localStorage.getItem(GENMERCH_DRAFT_OWNER_KEY)||'';
            localRaw=newestRaw;
            localSnapshot=parseCustomerDraftSnapshot(newestRaw);
            localUpdatedAt=newestUpdatedAt;
          }
        }catch(_){}
        const cloudRow=cloudResult.data||null;
        const cloudUpdatedAt=cloudRow&&cloudRow.updated_at?new Date(cloudRow.updated_at).getTime():0;
        if(cloudRow&&localSnapshot&&owner===userId&&localUpdatedAt>cloudUpdatedAt){
          await upsertCustomerDraftCloud(userId,localSnapshot);
        }else if(cloudRow){
          const cloudSnapshot=parseCustomerDraftSnapshot(JSON.stringify(cloudRow.draft_state));
          if(!cloudSnapshot)throw new Error('The saved cloud checkout draft is invalid. Your local draft has been preserved.');
          if(localSnapshot&&localBelongsToUser&&!owner&&hasMeaningfulCustomerDraft(localSnapshot)){
            const mergedSnapshot=mergeCustomerDraftSnapshots(localSnapshot,cloudSnapshot,localUpdatedAt>cloudUpdatedAt);
            localStorage.setItem(GENMERCH_DRAFT_STORAGE_KEY,JSON.stringify(mergedSnapshot));
            localStorage.setItem(GENMERCH_DRAFT_OWNER_KEY,userId);
            localStorage.setItem(GENMERCH_DRAFT_UPDATED_AT_KEY,String(Date.now()));
            await upsertCustomerDraftCloud(userId,mergedSnapshot);
          }else{
            localStorage.setItem(GENMERCH_DRAFT_STORAGE_KEY,JSON.stringify(cloudSnapshot));
            localStorage.setItem(GENMERCH_DRAFT_OWNER_KEY,userId);
            localStorage.setItem(GENMERCH_DRAFT_UPDATED_AT_KEY,String(cloudUpdatedAt||Date.now()));
          }
        }else if(localSnapshot&&localBelongsToUser&&(owner===userId||hasMeaningfulCustomerDraft(localSnapshot))){
          await upsertCustomerDraftCloud(userId,localSnapshot);
        }else{
          const emptyForm={};
          GENMERCH_DRAFT_FIELD_IDS.forEach(id=>{emptyForm[id]='';});
          const emptySnapshot={schemaVersion:1,cart:[],form:emptyForm,addressReference:{province:null,city:null,barangay:null},selectedPayment:'COD'};
          localStorage.setItem(GENMERCH_DRAFT_STORAGE_KEY,JSON.stringify(emptySnapshot));
          localStorage.setItem(GENMERCH_DRAFT_OWNER_KEY,userId);
          // Avoid uploading a blank guest draft: another device may still hold the legacy data to migrate.
          localStorage.removeItem(GENMERCH_DRAFT_UPDATED_AT_KEY);
        }
        customerDraftCloudReadyUserId=userId;
        return true;
      })();
      customerDraftCloudSyncPromise=syncPromise;
      try{
        await syncPromise;
        if(applyToUI){
          restoreDraftState();
          await restoreAddressReferenceContext();
          updateCart();
        }
        return true;
      }catch(error){
        customerDraftCloudReadyUserId='';
        console.warn('GENMERCH customer draft cloud sync failed.',error);
        if(applyToUI)setDraftSaveStatus('Could not sync this account’s cart and checkout details. Your current browser data has been kept.',true);
        return false;
      }finally{
        if(customerDraftCloudSyncPromise===syncPromise){customerDraftCloudSyncPromise=null;customerDraftCloudSyncUserId='';}
      }
    }

    function resetDraftInMemory() {
      isRestoringDraft = true;
      cart = [];
      GENMERCH_DRAFT_FIELD_IDS.forEach(id => {
        const field = $(id);
        if (field) field.value = '';
      });
      selectedPayment = 'COD';
      selectedProvinceRecord = null;
      selectedCityRecord = null;
      selectedBarangayRecord = null;
      currentCityBarangays = [];
      document.querySelectorAll('[data-payment]').forEach(button => {
        const isSelected=button.dataset.payment===selectedPayment;
        button.classList.toggle('active',isSelected);
        button.setAttribute('aria-pressed',String(isSelected));
      });
      document.querySelectorAll('.field-error').forEach(error => error.classList.remove('show'));
      document.querySelectorAll('.field input[aria-invalid="true"],.field textarea[aria-invalid="true"]').forEach(input=>input.removeAttribute('aria-invalid'));
      checkoutValidationAttempted=false;
      hideAllAddressSuggestions();
      isRestoringDraft = false;
    }

    function restoreDraftState(rawOverride) {
      let raw;
      try {
        raw = arguments.length ? rawOverride : localStorage.getItem(GENMERCH_DRAFT_STORAGE_KEY);
      } catch (error) {
        draftStorageAvailable = false;
        setDraftSaveStatus('Browser storage is blocked. Your information cannot be restored reliably here.', true);
        return false;
      }

      if (!raw) {
        resetDraftInMemory();
        setDraftSaveStatus('Autosave is ready. This browser has no saved draft yet.');
        return false;
      }

      let saved;
      try {
        saved = JSON.parse(raw);
        if (!saved || saved.schemaVersion !== 1 || typeof saved !== 'object') throw new Error('Unsupported saved draft');
      } catch (error) {
        try { localStorage.removeItem(GENMERCH_DRAFT_STORAGE_KEY); } catch (_) {}
        resetDraftInMemory();
        setDraftSaveStatus('The previous saved draft was unreadable and has been cleared.', true);
        return false;
      }

      isRestoringDraft = true;
      const restoredCart = [];
      const seen = new Map();
      const savedItems = Array.isArray(saved.cart) ? saved.cart.slice(0, 100) : [];
      savedItems.forEach(entry => {
        const product = products.find(item => String(item.id) === String(entry?.id)) || (catalogLoadState !== 'connected' ? LOCAL_DEMO_PRODUCTS.find(item => String(item.id) === String(entry?.id)) : null);
        const size = String(entry?.size || '');
        const qty = Math.floor(Number(entry?.qty));
        if (!product || !Number.isFinite(qty) || qty < 1) return;
        const savedVariant = Array.isArray(product.variants) ? product.variants.find(variant => String(variant.id) === String(entry?.variantId || '') || (!entry?.variantId && variant.size === size)) : null;
        if (Array.isArray(product.variants) && (!savedVariant || savedVariant.stock < 1)) return;
        if (!Array.isArray(product.variants) && !GENMERCH_ALLOWED_SIZES.includes(size)) return;
        const safeQty = Math.min(999, qty);
        const key = `${product.id}|${savedVariant?.id || ''}|${size}`;
        if (seen.has(key)) {
          seen.get(key).qty = Math.min(savedVariant?.stock ?? 999, seen.get(key).qty + safeQty);
        } else {
          const item = { ...product, ...(savedVariant ? { variantId: savedVariant.id, variantSku: savedVariant.sku, availableStock: savedVariant.stock, price: savedVariant.price ?? product.price } : {}), size, qty: savedVariant ? Math.min(safeQty, savedVariant.stock) : safeQty };
          seen.set(key, item);
          restoredCart.push(item);
        }
      });
      cart = restoredCart;

      const refs = saved.addressReference && typeof saved.addressReference === 'object' ? saved.addressReference : {};
      selectedProvinceRecord = compactAddressRecord(refs.province);
      selectedCityRecord = compactAddressRecord(refs.city);
      selectedBarangayRecord = compactAddressRecord(refs.barangay);
      currentCityBarangays = [];

      const savedForm = saved.form && typeof saved.form === 'object' ? saved.form : {};
      GENMERCH_DRAFT_FIELD_IDS.forEach(id => {
        const field = $(id);
        if (field) field.value = typeof savedForm[id] === 'string' ? savedForm[id].slice(0, 2000) : '';
      });
      // Upgrade legacy drafts that used one Full Name field to the new first/last-name fields.
      const legacyFullName=String(savedForm.custName||'').trim().replace(/\s+/g,' ');
      if(!$('firstName').value.trim()&&!$('lastName').value.trim()&&legacyFullName){
        const nameParts=legacyFullName.split(' ');
        $('firstName').value=nameParts.shift()||'';
        $('lastName').value=nameParts.join(' ');
      }
      syncCheckoutFullName();
      selectedPayment = ['COD', 'GCash', 'Maya', 'Bank Transfer'].includes(saved.selectedPayment) ? saved.selectedPayment : 'COD';
      document.querySelectorAll('[data-payment]').forEach(button => {
        const isSelected=button.dataset.payment===selectedPayment;
        button.classList.toggle('active',isSelected);
        button.setAttribute('aria-pressed',String(isSelected));
      });
      isRestoringDraft = false;
      draftStorageAvailable = true;
      setDraftSaveStatus('✓ Restored saved cart and delivery details from this browser.');
      return true;
    }

    async function restoreAddressReferenceContext() {
      // Rebuild autocomplete selections after refresh so the address still resolves to its delivery zone.
      if (!$('province').value.trim() && !$('city').value.trim()) return;
      try {
        const [provinces, municipalities] = await Promise.all([loadProvinceData(), loadMunicipalityData()]);
        selectedProvinceRecord = findExactProvinceRecord($('province').value.trim());
        selectedCityRecord = findExactCityRecord($('city').value.trim(), selectedProvinceRecord);
        if (!selectedProvinceRecord && selectedCityRecord) {
          selectedProvinceRecord = findProvinceForCity(selectedCityRecord, provinces);
        }
        // Keep the record only if it corresponds to the text currently in the matching input.
        if (selectedProvinceRecord && normalizeAddressText(placeName(selectedProvinceRecord)) !== normalizeAddressText($('province').value)) {
          selectedProvinceRecord = findExactProvinceRecord($('province').value.trim());
        }
        if (selectedCityRecord && normalizeAddressText(placeName(selectedCityRecord)) !== normalizeAddressText($('city').value)) {
          selectedCityRecord = findExactCityRecord($('city').value.trim(), selectedProvinceRecord);
        }
        if (selectedProvinceRecord && !$('province').value.trim()) $('province').value = placeName(selectedProvinceRecord);
        if (selectedCityRecord && !$('city').value.trim()) $('city').value = placeName(selectedCityRecord);
        if (selectedCityRecord) {
          const barangays = await loadBarangaysForCity(selectedCityRecord);
          currentCityBarangays = barangays;
          const typedBarangay = normalizeAddressText($('barangay').value);
          selectedBarangayRecord = barangays.find(record => normalizeAddressText(placeName(record)) === typedBarangay) || null;
        }
      } catch (error) {
        // Preserve the customer's saved address even if the suggestion provider is temporarily unavailable.
      }
      updateCart();
    }

    async function syncCustomerDataNow(){
      const buttons=[$('wishlistSyncNowButton'),$('syncCustomerDataButton')].filter(Boolean);
      buttons.forEach(button=>{button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Syncing…';});
      try{
        const client=getCustomerAuthClient(),sessionResult=await client.auth.getSession();
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session?sessionResult.data.session:null;
        if(!session||!session.user){
          updateWishlistSyncStatus('Sign in to your GENMERCH customer account before syncing across devices.','warning');
          setDraftSaveStatus('Sign in to sync your Wishlist, cart, and checkout details across devices.',true);
          showToast('Please sign in to your GENMERCH customer account first.');
          return;
        }
        customerAuthCurrentSession=session;
        await syncWishlistForCustomerSession(session,true);
        const wishlistError=wishlistCloudSyncError;
        const draftOk=await syncCustomerDraftForSession(session,true);
        const errors=[];
        if(wishlistError)errors.push('Wishlist: '+wishlistError);
        if(!draftOk)errors.push('Cart/checkout details could not be synced. Your current local copy has been preserved.');
        if(errors.length){
          const message=errors.join(' ');
          updateWishlistSyncStatus(message,'error');
          setDraftSaveStatus(message,true);
          showToast('Some account data did not sync. Check the status message and retry.');
          return;
        }
        updateWishlistSyncStatus('✓ Synced to your account · '+wishlistProductIds.length+' Wishlist product(s).','success');
        setDraftSaveStatus('✓ Wishlist, cart, and checkout details are synced to your GENMERCH account. You can now open the same account on another device.');
        showToast('GENMERCH account data synced.');
        if($('wishlistOverlay')&&$('wishlistOverlay').classList.contains('open'))renderWishlist();
      }catch(error){
        console.error('GENMERCH account data sync failed.',error);
        const message=error&&error.message?String(error.message):'Account sync failed. Please retry.';
        updateWishlistSyncStatus(message,'error');
        setDraftSaveStatus('Account sync failed. Your local data has been preserved. '+message,true);
        showToast('Account sync failed. Your local data was kept.');
      }finally{
        buttons.forEach(button=>{button.disabled=false;button.textContent=button.dataset.originalText||'↻ Sync account data';delete button.dataset.originalText;});
      }
    }
    function clearSavedDraft() {
      const confirmed = window.confirm('Clear the saved cart and all delivery details from this browser? This cannot be undone.');
      if (!confirmed) return;
      resetDraftInMemory();
      try {
        localStorage.removeItem(GENMERCH_DRAFT_STORAGE_KEY);
        draftStorageAvailable = true;
        setDraftSaveStatus('Saved cart and delivery details cleared from this browser.');
      } catch (error) {
        setDraftSaveStatus('The form is cleared, but browser storage could not be cleared. Check your browser settings.', true);
      }
      updateCart();
      // updateCart autosaves the empty draft so the cleared information cannot reappear on reload.
      setDraftSaveStatus(customerDraftCloudReadyUserId?'✓ Saved cart and checkout details cleared; syncing the empty draft to your account.':'✓ Saved cart and delivery details cleared. Autosave remains active for future changes.');
    }

    // Keep open tabs on the same browser profile in sync. This does not sync across separate devices.
    window.addEventListener('storage', event => {
      if (event.key !== GENMERCH_DRAFT_STORAGE_KEY && event.key !== null) return;
      restoreDraftState(event.key === null ? null : event.newValue);
      updateCart();
      restoreAddressReferenceContext();
    });

    // Philippine address suggestions from Open Admin Data's CORS-enabled static JSON API.
    // Only public administrative place datasets are fetched; typed customer/street details are not sent to this provider.
    const ADDRESS_DATA_BASE = 'https://api.openadmindata.org/api/v1';
    let provinceDataPromise = null;
    let municipalityDataPromise = null;
    let cachedProvinceRecords = [];
    let cachedMunicipalityRecords = [];
    const barangayDataCache = new Map();
    let allBarangayDataPromise = null;
    let selectedProvinceRecord = null;
    let selectedCityRecord = null;
    let selectedBarangayRecord = null;
    let currentCityBarangays = [];

    function normalizeAddressText(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    async function fetchAddressJson(path) {
      const response = await fetch(`${ADDRESS_DATA_BASE}/${path}`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Address data request failed (${response.status})`);
      return response.json();
    }

    function responseEntities(payload) {
      if (Array.isArray(payload?.entities)) return payload.entities;
      if (Array.isArray(payload?.data?.entities)) return payload.data.entities;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    }

    function loadProvinceData() {
      if (!provinceDataPromise) {
        provinceDataPromise = fetchAddressJson('ph/province.json')
          .then(payload => responseEntities(payload))
          .then(records => {
            if (!records.length) throw new Error('Province list is empty');
            cachedProvinceRecords = records;
            return records;
          })
          .catch(error => {
            provinceDataPromise = null;
            throw error;
          });
      }
      return provinceDataPromise;
    }

    function loadMunicipalityData() {
      if (!municipalityDataPromise) {
        municipalityDataPromise = fetchAddressJson('ph/municipality.json')
          .then(payload => responseEntities(payload))
          .then(records => {
            if (!records.length) throw new Error('City and municipality list is empty');
            cachedMunicipalityRecords = records;
            return records;
          })
          .catch(error => {
            municipalityDataPromise = null;
            throw error;
          });
      }
      return municipalityDataPromise;
    }

    function placeName(record) {
      return record?.name_en || record?.name_local || record?.name || '';
    }

    function placeParentName(record) {
      return record?.parent_name_en || record?.parent_name_local || '';
    }

    function getPostalCodes(record) {
      const values = [];
      if (record?.postal_code) values.push(String(record.postal_code));
      if (Array.isArray(record?.zip_codes)) values.push(...record.zip_codes.map(String));
      if (Array.isArray(record?.zipCodes)) values.push(...record.zipCodes.map(String));
      return [...new Set(values.map(value => value.trim()).filter(value => /^\d{4}$/.test(value)))];
    }

    function showSuggestionMessage(fieldId, message) {
      const input = $(fieldId);
      const box = $(`${fieldId}Suggestions`);
      box.replaceChildren();
      const row = document.createElement('div');
      row.className = 'address-suggestion-message';
      row.textContent = message;
      box.appendChild(row);
      box.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    }

    function hideSuggestions(fieldId) {
      const box = $(`${fieldId}Suggestions`);
      if (!box) return;
      box.classList.remove('open');
      $(fieldId).setAttribute('aria-expanded', 'false');
    }

    function hideAllAddressSuggestions() {
      ['province', 'city', 'barangay', 'postalCode'].forEach(hideSuggestions);
    }

    function renderAddressSuggestions(fieldId, records, selectRecord, options = {}) {
      const input = $(fieldId);
      const box = $(`${fieldId}Suggestions`);
      box.replaceChildren();
      const maxResults = options.maxResults || 9;
      const results = records.slice(0, maxResults);

      if (!results.length) {
        showSuggestionMessage(fieldId, options.emptyMessage || 'No matches found. You may still enter the address manually.');
        return;
      }

      results.forEach(record => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'address-suggestion';
        button.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.textContent = record.label || placeName(record) || String(record.value || '');
        button.appendChild(title);
        const detailText = record.detail || '';
        if (detailText) {
          const detail = document.createElement('small');
          detail.textContent = detailText;
          button.appendChild(detail);
        }
        // Do not hide suggestions on blur before the click event is handled.
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('keydown', event => {
          const choices = [...box.querySelectorAll('button.address-suggestion')];
          const currentIndex = choices.indexOf(button);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            (choices[currentIndex + 1] || choices[0])?.focus();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (currentIndex <= 0) input.focus();
            else choices[currentIndex - 1]?.focus();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            hideSuggestions(fieldId);
            input.focus();
          }
        });
        button.addEventListener('click', () => selectRecord(record));
        box.appendChild(button);
      });

      box.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    }

    function containsQuery(record, query, extra = '') {
      const needle = normalizeAddressText(query);
      if (!needle) return true;
      const haystack = normalizeAddressText([
        placeName(record),
        placeParentName(record),
        record?.postal_code,
        ...(Array.isArray(record?.zip_codes) ? record.zip_codes : []),
        extra
      ].join(' '));
      return haystack.includes(needle);
    }

    function resetDownstreamAddressFields(fromLevel) {
      if (fromLevel === 'province') {
        selectedCityRecord = null;
        selectedBarangayRecord = null;
        currentCityBarangays = [];
        $('city').value = '';
        $('barangay').value = '';
        $('postalCode').value = '';
        ['city', 'barangay', 'postalCode'].forEach(hideSuggestions);
      } else if (fromLevel === 'city') {
        selectedBarangayRecord = null;
        currentCityBarangays = [];
        $('barangay').value = '';
        $('postalCode').value = '';
        ['barangay', 'postalCode'].forEach(hideSuggestions);
      } else if (fromLevel === 'barangay') {
        selectedBarangayRecord = null;
        $('postalCode').value = '';
        hideSuggestions('postalCode');
      }
      if (typeof updateCart === 'function') updateCart();
    }

    async function updateProvinceSuggestions() {
      const query = $('province').value.trim();
      try {
        const records = await loadProvinceData();
        if (query !== $('province').value.trim()) return;
        const sorted = [...records].sort((a, b) => placeName(a).localeCompare(placeName(b)));
        const matches = sorted.filter(record => containsQuery(record, query));
        renderAddressSuggestions('province', matches, selectProvince, {
          emptyMessage: 'No province match found. Check the spelling or enter the address manually.'
        });
        updateCart();
      } catch (error) {
        showSuggestionMessage('province', 'Address suggestions are temporarily unavailable. You can still type the province manually.');
      }
    }

    async function updateCitySuggestions() {
      const query = $('city').value.trim();
      try {
        const records = await loadMunicipalityData();
        if (query !== $('city').value.trim()) return;
        const province = selectedProvinceRecord;
        const narrowed = province
          ? records.filter(record => String(record.parent_id || '') === String(province.id || '') ||
              normalizeAddressText(placeParentName(record)) === normalizeAddressText(placeName(province)))
          : records;
        const matches = narrowed
          .filter(record => containsQuery(record, query))
          .sort((a, b) => {
            const left = normalizeAddressText(placeName(a));
            const right = normalizeAddressText(placeName(b));
            const needle = normalizeAddressText(query);
            const leftScore = left.startsWith(needle) ? 0 : 1;
            const rightScore = right.startsWith(needle) ? 0 : 1;
            return leftScore - rightScore || left.localeCompare(right) || placeParentName(a).localeCompare(placeParentName(b));
          })
          .map(record => ({
            ...record,
            label: placeName(record),
            detail: placeParentName(record) || (province ? placeName(province) : 'Philippines')
          }));
        renderAddressSuggestions('city', matches, selectCity, {
          emptyMessage: province
            ? 'No city or municipality matches this province. Check the spelling or enter it manually.'
            : 'No matching city found. You may select a province first for more precise suggestions.'
        });
        updateCart();
      } catch (error) {
        showSuggestionMessage('city', 'City suggestions are temporarily unavailable. You can still type the city manually.');
      }
    }

    async function loadBarangaysForCity(cityRecord) {
      const key = String(cityRecord?.slug || cityRecord?.id || '');
      if (!key) return [];
      if (barangayDataCache.has(key)) return barangayDataCache.get(key);

      const pending = (async () => {
        // Fetch only the selected municipality's detail and child barangays first.
        if (cityRecord.slug) {
          try {
            const detail = await fetchAddressJson(`ph/municipality/${encodeURIComponent(cityRecord.slug)}.json`);
            const childList = detail?.children?.entities || detail?.data?.children?.entities || [];
            if (Array.isArray(childList) && childList.length) return childList;
          } catch (error) {
            // The full barangay endpoint is a fallback; it is fetched at most once per browser session.
          }
        }

        if (!allBarangayDataPromise) {
          allBarangayDataPromise = fetchAddressJson('ph/barangay.json')
            .then(payload => responseEntities(payload))
            .catch(error => {
              allBarangayDataPromise = null;
              throw error;
            });
        }
        const allBarangays = await allBarangayDataPromise;
        const cityId = String(cityRecord.id || '');
        const cityName = normalizeAddressText(placeName(cityRecord));
        return allBarangays.filter(record =>
          String(record.parent_id || '') === cityId ||
          normalizeAddressText(placeParentName(record)) === cityName
        );
      })();

      barangayDataCache.set(key, pending);
      try {
        const records = await pending;
        barangayDataCache.set(key, records);
        return records;
      } catch (error) {
        barangayDataCache.delete(key);
        throw error;
      }
    }

    async function ensureSelectedCityBarangays() {
      if (!selectedCityRecord) return [];
      if (currentCityBarangays.length) return currentCityBarangays;
      const cityAtRequest = selectedCityRecord;
      showSuggestionMessage('barangay', 'Loading barangays for the selected city…');
      try {
        const records = await loadBarangaysForCity(cityAtRequest);
        if (selectedCityRecord && String(selectedCityRecord.slug || selectedCityRecord.id) === String(cityAtRequest.slug || cityAtRequest.id)) {
          currentCityBarangays = records;
        }
        return records;
      } catch (error) {
        showSuggestionMessage('barangay', 'Barangay suggestions could not be loaded. You can still type the barangay manually.');
        return [];
      }
    }

    function selectProvince(record) {
      selectedProvinceRecord = record;
      $('province').value = placeName(record);
      hideSuggestions('province');
      resetDownstreamAddressFields('province');
      $('provinceError').classList.remove('show');
      $('city').focus();
      updateCitySuggestions();
    }

    function findProvinceForCity(record, provinces) {
      return provinces.find(province => String(province.id || '') === String(record.parent_id || '')) ||
        provinces.find(province => normalizeAddressText(placeName(province)) === normalizeAddressText(placeParentName(record))) || null;
    }

    async function selectCity(record) {
      selectedCityRecord = record;
      $('city').value = placeName(record);
      hideSuggestions('city');

      try {
        const provinces = await loadProvinceData();
        const parentProvince = findProvinceForCity(record, provinces);
        if (parentProvince) {
          selectedProvinceRecord = parentProvince;
          $('province').value = placeName(parentProvince);
          $('provinceError').classList.remove('show');
          hideSuggestions('province');
        }
      } catch (error) {
        // If the province list fails, preserve the user's manually entered province.
      }

      resetDownstreamAddressFields('city');
      $('cityError').classList.remove('show');
      updateCart();
      $('barangay').focus();
      updateBarangaySuggestions();
    }

    async function updateBarangaySuggestions() {
      const query = $('barangay').value.trim();
      const cityAtRequest = selectedCityRecord;
      if (!selectedCityRecord) {
        showSuggestionMessage('barangay', 'Choose a city/municipality first to see matching barangays.');
        return;
      }
      try {
        const records = await ensureSelectedCityBarangays();
        if (query !== $('barangay').value.trim() ||
            String(cityAtRequest?.slug || cityAtRequest?.id || '') !== String(selectedCityRecord?.slug || selectedCityRecord?.id || '')) return;
        const matches = records
          .filter(record => containsQuery(record, query))
          .sort((a, b) => {
            const needle = normalizeAddressText(query);
            const aName = normalizeAddressText(placeName(a));
            const bName = normalizeAddressText(placeName(b));
            const aScore = aName.startsWith(needle) ? 0 : 1;
            const bScore = bName.startsWith(needle) ? 0 : 1;
            return aScore - bScore || aName.localeCompare(bName);
          })
          .map(record => ({
            ...record,
            label: placeName(record),
            detail: getPostalCodes(record).length ? `Postal code: ${getPostalCodes(record).join(', ')}` : 'Postal code not listed for this barangay'
          }));
        renderAddressSuggestions('barangay', matches, selectBarangay, {
          emptyMessage: 'No barangay match found in this city. Check spelling or enter it manually.'
        });
      } catch (error) {
        showSuggestionMessage('barangay', 'Barangay suggestions are temporarily unavailable. You can still type it manually.');
      }
    }

    function selectBarangay(record) {
      selectedBarangayRecord = record;
      $('barangay').value = placeName(record);
      hideSuggestions('barangay');
      $('barangayError').classList.remove('show');
      const postalCodes = getPostalCodes(record);
      if (postalCodes.length) {
        $('postalCode').value = postalCodes[0];
        $('postalError').classList.remove('show');
      } else {
        $('postalCode').value = '';
      }
      updateCart();
      if (!postalCodes.length) updatePostalSuggestions();
    }

    async function updatePostalSuggestions() {
      const query = $('postalCode').value.trim();
      const cityAtRequest = selectedCityRecord;
      if (!selectedCityRecord) {
        showSuggestionMessage('postalCode', 'Choose a city/municipality first to get postal-code suggestions.');
        return;
      }
      try {
        const records = await ensureSelectedCityBarangays();
        if (query !== $('postalCode').value.trim() ||
            String(cityAtRequest?.slug || cityAtRequest?.id || '') !== String(selectedCityRecord?.slug || selectedCityRecord?.id || '')) return;
        const codes = new Map();
        records.forEach(record => getPostalCodes(record).forEach(code => {
          if (!codes.has(code)) codes.set(code, new Set());
          codes.get(code).add(placeName(record));
        }));
        const matches = [...codes.entries()]
          .filter(([code]) => !query || code.includes(query))
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, barangays]) => ({
            value: code,
            label: code,
            detail: `Listed for: ${[...barangays].slice(0, 3).join(', ')}${barangays.size > 3 ? '…' : ''}`
          }));
        renderAddressSuggestions('postalCode', matches, record => {
          $('postalCode').value = record.value;
          hideSuggestions('postalCode');
          $('postalError').classList.remove('show');
          updateCart();
        }, { emptyMessage: 'No postal code is listed for this city and query. You can type it manually.' });
      } catch (error) {
        showSuggestionMessage('postalCode', 'Postal-code suggestions could not be loaded. You can still enter the code manually.');
      }
    }

    function bindAutocompleteKeyboard(fieldId) {
      $(fieldId).addEventListener('keydown', event => {
        const box = $(`${fieldId}Suggestions`);
        const options = [...box.querySelectorAll('button.address-suggestion')];
        if (event.key === 'ArrowDown' && box.classList.contains('open') && options.length) {
          event.preventDefault();
          options[0].focus();
        } else if (event.key === 'Enter' && box.classList.contains('open') && options.length) {
          // Prevent Enter from accidentally submitting the checkout form while choosing a suggestion.
          event.preventDefault();
          options[0].click();
        } else if (event.key === 'Escape' && box.classList.contains('open')) {
          event.preventDefault();
          hideSuggestions(fieldId);
        }
      });
    }
    ['province', 'city', 'barangay', 'postalCode'].forEach(bindAutocompleteKeyboard);

    // Autocomplete only looks up administrative reference data; it does not submit the customer's personal address.
    $('province').addEventListener('input', () => {
      selectedProvinceRecord = null;
      resetDownstreamAddressFields('province');
      updateProvinceSuggestions();
    });
    $('province').addEventListener('focus', updateProvinceSuggestions);
    $('city').addEventListener('input', () => {
      selectedCityRecord = null;
      resetDownstreamAddressFields('city');
      updateCitySuggestions();
    });
    $('city').addEventListener('focus', updateCitySuggestions);
    $('barangay').addEventListener('input', () => {
      selectedBarangayRecord = null;
      resetDownstreamAddressFields('barangay');
      updateBarangaySuggestions();
    });
    $('barangay').addEventListener('focus', updateBarangaySuggestions);
    $('postalCode').addEventListener('input', updatePostalSuggestions);
    $('postalCode').addEventListener('focus', updatePostalSuggestions);
    document.addEventListener('click', event => {
      if (!event.target.closest('.autocomplete-wrap')) hideAllAddressSuggestions();
    });

    // Shared read-only reference data for both checkout and the saved address book.
    // This exposes the same cached datasets and normalization logic without sending
    // customer names, phones, or street details to the public reference-data API.
    window.genmerchAddressReference = {
      loadProvinces: loadProvinceData,
      loadMunicipalities: loadMunicipalityData,
      loadBarangays: loadBarangaysForCity,
      getName: placeName,
      getParentName: placeParentName,
      getPostalCodes,
      normalize: normalizeAddressText,
      restoreContext: restoreAddressReferenceContext
    };

    function updateFlashDealsCountdown(){
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US',{
        timeZone:'Asia/Manila',year:'numeric',month:'numeric',day:'numeric'
      }).formatToParts(now);
      const value = type => Number(parts.find(part=>part.type===type)?.value||0);
      const year=value('year'),month=value('month'),day=value('day');
      // Manila uses UTC+08:00 year-round. Count down to the next local midnight.
      const nextMidnightUtc = Date.UTC(year,month-1,day+1)-8*60*60*1000;
      const remaining = Math.max(0,nextMidnightUtc-now.getTime());
      const totalSeconds = Math.floor(remaining/1000);
      const hours = Math.floor(totalSeconds/3600);
      const minutes = Math.floor((totalSeconds%3600)/60);
      const seconds = totalSeconds%60;
      $('flashHours').textContent=String(hours).padStart(2,'0');
      $('flashMinutes').textContent=String(minutes).padStart(2,'0');
      $('flashSeconds').textContent=String(seconds).padStart(2,'0');
    }
    updateFlashDealsCountdown();
    setInterval(updateFlashDealsCountdown,1000);

    function showToast(message,duration=2300){
      $('toastText').textContent = message;
      $('toast').classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(()=>$('toast').classList.remove('show'),duration);
    }

    // Show the reload confirmation only after the startup overlay has fully disappeared.
    let pendingGenmerchReloadNotice='';
    window.addEventListener('genmerch:initial-loader-dismissed',()=>{
      if(!pendingGenmerchReloadNotice)return;
      const message=pendingGenmerchReloadNotice;
      pendingGenmerchReloadNotice='';
      showToast(message,4500);
    });

    let genmerchActionStatusTimer=null;
    let genmerchActionStatusToken=0;
    let genmerchActionStatusType='';
    function showCenteredActionStatus(message='Please wait...',type='loading',duration=0,subtext=''){
      const overlay=$('genmerchActionOverlay');if(!overlay)return;
      if(genmerchActionStatusTimer!==null){clearTimeout(genmerchActionStatusTimer);genmerchActionStatusTimer=null;}
      const token=++genmerchActionStatusToken;
      const spinner=$('genmerchActionSpinner'),icon=$('genmerchActionStatusIcon');
      const text=$('genmerchActionStatusMessage'),detail=$('genmerchActionStatusSubtext');
      genmerchActionStatusType=type;text.textContent=String(message||'Please wait, processing your request...');
      spinner.hidden=type!=='loading';icon.hidden=type==='loading';icon.classList.toggle('error',type==='error');icon.textContent=type==='error'?'!':'✓';
      detail.textContent=String(subtext||'');detail.hidden=!subtext;overlay.dataset.statusType=type;
      overlay.classList.add('active');overlay.setAttribute('aria-hidden','false');
      if(Number(duration)>0)genmerchActionStatusTimer=window.setTimeout(()=>{if(token===genmerchActionStatusToken)hideCenteredActionStatus();},Number(duration));
    }
    function hideCenteredActionStatus(){
      if(genmerchActionStatusTimer!==null){clearTimeout(genmerchActionStatusTimer);genmerchActionStatusTimer=null;}
      genmerchActionStatusToken++;genmerchActionStatusType='';
      const overlay=$('genmerchActionOverlay');if(overlay){overlay.classList.remove('active');overlay.setAttribute('aria-hidden','true');delete overlay.dataset.statusType;}
    }
    function isCenteredActionStatusLoading(){
      const overlay=$('genmerchActionOverlay');
      return Boolean(overlay&&overlay.classList.contains('active')&&genmerchActionStatusType==='loading');
    }

    const categoryIcons = {
      'T-Shirts': '👕', 'T-Shirts & Tops': '👕', 'Shorts': '🩳', 'Pants': '👖',
      'Caps': '🧢', 'GenMerch Premium': '✨', 'Sando': '👕', 'Other': '🛍️', 'Others': '🛍️'
    };

    function getProductsWithImages(){
      return products.filter(product => Boolean(product.image || (Array.isArray(product.images) && product.images.some(image => image && image.url))));
    }

    // Search aliases let customers use common English and Filipino apparel terms.
    // Each trigger expands into related words, while ordinary query words still match directly.
    const GENMERCH_PRODUCT_SEARCH_SYNONYMS = [
      {triggers:['short','shorts','bermuda'],terms:['short','shorts','short pant','short pants','bermuda','bermuda shorts','cargo shorts','gym shorts','athletic shorts','running shorts','basketball shorts','cycling shorts','lounge shorts','drawstring shorts']},
      {triggers:['shirt','shirts','tshirt','tshirts','tee','tees'],terms:['shirt','shirts','t shirt','t shirts','tshirt','tshirts','tee','tees','graphic tee','cotton tee','oversized tee','polo shirt','polo shirts']},
      {triggers:['sando','sandos','tank','sleeveless','undershirt','muscle'],terms:['sando','sandos','tank top','tank tops','sleeveless','sleeveless shirt','undershirt','muscle shirt','athletic tank','gym tank']},
      {triggers:['hoodie','hoodies','sweatshirt','sweatshirts'],terms:['hoodie','hoodies','sweatshirt','sweatshirts','pullover hoodie','pullover']},
      {triggers:['pant','pants','trouser','trousers','jogger','joggers','leggings'],terms:['pant','pants','trouser','trousers','jogger','joggers','track pants','long pants','lounge pants','sweatpants','leggings']},
      {triggers:['cap','caps','hat','hats','snapback'],terms:['cap','caps','hat','hats','baseball cap','snapback','headwear']},
      {triggers:['jacket','jackets','windbreaker','coat','coats'],terms:['jacket','jackets','windbreaker','coat','coats','outerwear']},
      {triggers:['polo','polos'],terms:['polo','polos','polo shirt','polo shirts']},
      {triggers:['dress','dresses'],terms:['dress','dresses','casual dress','summer dress']},
      {triggers:['bag','bags','backpack','backpacks','tote'],terms:['bag','bags','backpack','backpacks','tote bag','tote bags','shoulder bag','crossbody bag']},
      {triggers:['shoe','shoes','sneaker','sneakers','footwear'],terms:['shoe','shoes','sneaker','sneakers','running shoes','trainers','footwear']},
      {triggers:['sock','socks'],terms:['sock','socks','ankle socks','crew socks']}
    ];

    function normalizeCatalogSearchText(value){
      return String(value===null||value===undefined?'':value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toLowerCase()
        .replace(/&/g,' and ')
        .replace(/[^a-z0-9]+/g,' ')
        .replace(/ +/g,' ')
        .trim();
    }

    function addCatalogSearchValue(values,value){
      if(value===null||value===undefined)return;
      if(Array.isArray(value)){value.forEach(item=>addCatalogSearchValue(values,item));return;}
      if(typeof value==='string'||typeof value==='number')values.push(String(value));
    }

    function getCatalogSearchTerms(query){
      const normalized=normalizeCatalogSearchText(query);
      const tokens=normalized.split(' ').filter(token=>token.length>1);
      const terms=new Set(tokens);
      GENMERCH_PRODUCT_SEARCH_SYNONYMS.forEach(group=>{
        if(group.triggers.some(trigger=>tokens.includes(normalizeCatalogSearchText(trigger)))){
          group.terms.forEach(term=>{
            const normalizedTerm=normalizeCatalogSearchText(term);
            if(normalizedTerm)terms.add(normalizedTerm);
          });
        }
      });
      return [...terms];
    }

    function productMatchesCatalogSearch(product,searchTerms){
      const values=[];
      [
        product.name,product.cat,product.desc,product.sku,
        product.brand,product.color,product.material,product.type,
        product.keywords,product.searchKeywords,product.tags
      ].forEach(value=>addCatalogSearchValue(values,value));
      (Array.isArray(product.variants)?product.variants:[]).forEach(variant=>{
        if(!variant)return;
        values.push(variant.sku,variant.size,variant.color);
      });
      (Array.isArray(product.images)?product.images:[]).forEach(image=>{
        if(!image)return;
        values.push(image.alt,image.colorLabel,image.alt_text);
      });
      const searchable=' '+normalizeCatalogSearchText(values.join(' '))+' ';
      return searchTerms.some(term=>searchable.includes(' '+term+' '));
    }

    const WISHLIST_GUEST_STORAGE_KEY = 'genmerch:wishlist:guest:v1';
    let wishlistProductIds = [];
    let wishlistCloudSyncError = '';
    let wishlistCloudSyncWarning = '';
    let wishlistLastLoadedStorageKey = '';
    const wishlistWriteChains = new Map();
    const wishlistWriteVersions = new Map();
    const wishlistConfirmedSavedState = new Map();
    function getWishlistStorageKey(session=customerAuthCurrentSession){
      const userId=session&&session.user&&session.user.id?String(session.user.id):'';
      return userId?'genmerch:wishlist:user:'+encodeURIComponent(userId):WISHLIST_GUEST_STORAGE_KEY;
    }
    function readWishlistIds(key){
      try{
        const parsed=JSON.parse(localStorage.getItem(key)||'[]');
        return Array.isArray(parsed)?[...new Set(parsed.map(id=>String(id)).filter(Boolean))]:[];
      }catch(_){return [];}
    }
    function writeWishlistIds(key,ids){
      try{localStorage.setItem(key,JSON.stringify([...new Set((ids||[]).map(id=>String(id)).filter(Boolean))]));return true;}
      catch(error){console.warn('GENMERCH wishlist could not be saved in browser storage.',error);showToast('Unable to save wishlist on this browser.');return false;}
    }
    function updateWishlistSyncStatus(message,type=''){
      const node=$('wishlistSyncStatus');
      if(!node)return;
      node.textContent=message||'';
      node.className='wishlist-sync-status'+(type?' '+type:'');
    }
    async function syncWishlistForCustomerSession(session=customerAuthCurrentSession,refreshUI=true){
      const resolveSession=arguments.length===0||arguments[0]===undefined;
      let client=null,unavailableLegacyCount=0;
      wishlistCloudSyncError='';
      wishlistCloudSyncWarning='';
      try{
        if(resolveSession){
          client=getCustomerAuthClient();
          const sessionResult=await client.auth.getSession();
          if(sessionResult.error)throw sessionResult.error;
          session=sessionResult.data&&sessionResult.data.session?sessionResult.data.session:null;
          customerAuthCurrentSession=session&&session.user?session:null;
        }
        const userId=session&&session.user&&session.user.id?String(session.user.id):'';
        const key=getWishlistStorageKey(session);
        if(!userId){
          wishlistProductIds=readWishlistIds(WISHLIST_GUEST_STORAGE_KEY);
          wishlistLastLoadedStorageKey=WISHLIST_GUEST_STORAGE_KEY;
          updateWishlistSyncStatus('Saved on this device only. Sign in to sync your Wishlist across devices.','local');
        }else{
          client=client||getCustomerAuthClient();
          const localAccountIds=readWishlistIds(key);
          const guestIds=readWishlistIds(WISHLIST_GUEST_STORAGE_KEY);
          const memoryIds=(wishlistLastLoadedStorageKey===key||wishlistLastLoadedStorageKey===WISHLIST_GUEST_STORAGE_KEY)?wishlistProductIds.slice():[];
          const remoteResult=await client.from('customer_wishlist').select('product_id,created_at').eq('user_id',userId).order('created_at',{ascending:true});
          if(remoteResult.error)throw remoteResult.error;
          const remoteIds=(remoteResult.data||[]).map(row=>String(row.product_id));
          const remoteSet=new Set(remoteIds);
          const legacyIds=[...new Set([...localAccountIds,...guestIds,...memoryIds])].filter(id=>!remoteSet.has(id));
          for(const productId of legacyIds){
            const inserted=await client.from('customer_wishlist').upsert({user_id:userId,product_id:productId},{onConflict:'user_id,product_id',ignoreDuplicates:true});
            if(inserted.error){
              if(inserted.error.code==='23503'){unavailableLegacyCount++;continue;}
              throw inserted.error;
            }
          }
          const refreshed=await client.from('customer_wishlist').select('product_id,created_at').eq('user_id',userId).order('created_at',{ascending:true});
          if(refreshed.error)throw refreshed.error;
          wishlistProductIds=[...new Set((refreshed.data||[]).map(row=>String(row.product_id)))];
          if(!writeWishlistIds(key,wishlistProductIds))throw new Error('Could not update the local Wishlist cache.');
          try{localStorage.removeItem(WISHLIST_GUEST_STORAGE_KEY);}catch(_){}
          wishlistLastLoadedStorageKey=key;
          if(unavailableLegacyCount){
            wishlistCloudSyncWarning=unavailableLegacyCount+' saved item(s) could not be synced because the product no longer exists in the live catalog.';
            updateWishlistSyncStatus('Synced '+wishlistProductIds.length+' product(s). '+wishlistCloudSyncWarning,'warning');
          }else{
            updateWishlistSyncStatus('✓ Synced to your GENMERCH account · '+wishlistProductIds.length+' saved product(s).','success');
          }
        }
      }catch(error){
        wishlistCloudSyncError=error&&error.message?String(error.message):'Cloud Wishlist sync failed.';
        const userId=session&&session.user&&session.user.id?String(session.user.id):'';
        const fallbackKey=userId?getWishlistStorageKey(session):WISHLIST_GUEST_STORAGE_KEY;
        wishlistProductIds=[...new Set([...readWishlistIds(fallbackKey),...readWishlistIds(WISHLIST_GUEST_STORAGE_KEY)])];
        wishlistLastLoadedStorageKey=fallbackKey;
        updateWishlistSyncStatus(userId?'Cloud sync failed: '+wishlistCloudSyncError+' Your device copy was kept.':'Saved on this device only. Sign in to sync across devices.','error');
        console.warn('GENMERCH Wishlist cloud sync failed.',error);
      }
      updateWishlistBadge();
      if(refreshUI){
        renderProducts();
        updateWishlistDetailButton();
        if($('wishlistOverlay')&&$('wishlistOverlay').classList.contains('open'))renderWishlist();
      }
      return wishlistProductIds;
    }
    function isProductWishlisted(productId){
      return wishlistProductIds.includes(String(productId));
    }
    function updateWishlistBadge(){
      const badge=$('wishlistBadge');
      if(!badge)return;
      const count=wishlistProductIds.length;
      badge.textContent=count>99?'99+':String(count);
      badge.hidden=count===0;
      const button=badge.closest('button');
      if(button)button.setAttribute('aria-label',count?'Open wishlist, '+count+' saved product'+(count===1?'':'s'):'Open wishlist');
    }
    function updateWishlistDetailButton(productId=openProductDetailId){
      const button=$('productModalWishlistButton');
      if(!button)return;
      const hasProduct=productId!==null&&productId!==undefined&&String(productId)!=='';
      const saved=hasProduct&&isProductWishlisted(productId);
      button.textContent=saved?'♥ Saved to Wishlist':'♡ Add to Wishlist';
      button.classList.toggle('active',Boolean(saved));
      button.setAttribute('aria-pressed',String(Boolean(saved)));
    }
    function refreshWishlistProductButtons(productId){
      const id=String(productId||'');
      const product=products.find(item=>String(item.id)===id);
      const saved=wishlistProductIds.includes(id);
      document.querySelectorAll('[data-wishlist-id]').forEach(button=>{
        if(String(button.dataset.wishlistId||'')!==id)return;
        button.classList.toggle('active',saved);
        button.setAttribute('aria-pressed',String(saved));
        button.setAttribute('aria-label',saved
          ?'Remove '+String(product&&product.name||'product')+' from wishlist'
          :'Add '+String(product&&product.name||'product')+' to wishlist');
        button.setAttribute('title',saved?'Saved to Wishlist':'Add to Wishlist');
      });
      updateWishlistBadge();
      if(String(openProductDetailId||'')===id)updateWishlistDetailButton(id);
      if($('wishlistOverlay')&&$('wishlistOverlay').classList.contains('open'))renderWishlist();
    }
    async function setWishlistProductSaved(productId,shouldSave,successMessage=''){
      const id=String(productId||'');
      if(!id)return;
      shouldSave=Boolean(shouldSave);
      const session=customerAuthCurrentSession;
      const userId=session&&session.user&&session.user.id?String(session.user.id):'';
      const key=getWishlistStorageKey(session);
      const currentlySaved=wishlistProductIds.includes(id);
      if(currentlySaved===shouldSave){
        refreshWishlistProductButtons(id);
        return;
      }

      const nextIds=shouldSave
        ?[...new Set([...wishlistProductIds,id])]
        :wishlistProductIds.filter(value=>String(value)!==id);
      if(!writeWishlistIds(key,nextIds))return;

      // Update the customer-facing UI before waiting for Supabase.
      wishlistProductIds=nextIds;
      wishlistLastLoadedStorageKey=key;
      refreshWishlistProductButtons(id);
      const product=products.find(item=>String(item.id)===id);
      showToast(successMessage||(shouldSave?(product?product.name+' added to Wishlist':'Added to Wishlist'):'Removed from Wishlist'));

      if(!userId){
        updateWishlistSyncStatus('Saved on this device only. Sign in to sync your Wishlist across devices.','local');
        if(shouldSave&&typeof window.playGenmerchNotificationChime==='function'){
          window.playGenmerchNotificationChime('wishlist:add:guest:'+id+':'+Date.now());
        }
        return;
      }

      const queueKey=userId+':'+id;
      if(!wishlistConfirmedSavedState.has(queueKey))wishlistConfirmedSavedState.set(queueKey,currentlySaved);
      const version=(wishlistWriteVersions.get(queueKey)||0)+1;
      wishlistWriteVersions.set(queueKey,version);
      updateWishlistSyncStatus('Saving Wishlist change to your GENMERCH account…','local');

      const previousWrite=wishlistWriteChains.get(queueKey)||Promise.resolve();
      const operation=previousWrite.catch(()=>{}).then(async()=>{
        const client=getCustomerAuthClient();
        const result=shouldSave
          ?await client.from('customer_wishlist').upsert(
              {user_id:userId,product_id:id},
              {onConflict:'user_id,product_id',ignoreDuplicates:true}
            )
          :await client.from('customer_wishlist').delete().eq('user_id',userId).eq('product_id',id);
        if(result.error)throw result.error;
        wishlistConfirmedSavedState.set(queueKey,shouldSave);
        if(wishlistWriteVersions.get(queueKey)===version){
          updateWishlistSyncStatus('✓ Saved to your GENMERCH account · '+wishlistProductIds.length+' product(s).','success');
          if(shouldSave&&typeof window.playGenmerchNotificationChime==='function'){
            window.playGenmerchNotificationChime('wishlist:add:'+userId+':'+id+':'+Date.now());
          }
        }
      });
      wishlistWriteChains.set(queueKey,operation);
      operation.then(()=>{
        if(wishlistWriteChains.get(queueKey)===operation)wishlistWriteChains.delete(queueKey);
      },()=>{
        if(wishlistWriteChains.get(queueKey)===operation)wishlistWriteChains.delete(queueKey);
      });

      try{
        await operation;
      }catch(error){
        console.error('GENMERCH could not save Wishlist change.',error);
        // If a newer toggle exists, let its queued write decide the final state.
        if(wishlistWriteVersions.get(queueKey)!==version)return;
        const confirmed=Boolean(wishlistConfirmedSavedState.get(queueKey));
        const rollbackIds=wishlistProductIds.filter(value=>String(value)!==id);
        if(confirmed)rollbackIds.push(id);
        const uniqueRollbackIds=[...new Set(rollbackIds)];
        if(writeWishlistIds(key,uniqueRollbackIds)){
          wishlistProductIds=uniqueRollbackIds;
          wishlistLastLoadedStorageKey=key;
        }
        updateWishlistSyncStatus('Cloud sync failed. Your last confirmed Wishlist state was restored. Please try again.','error');
        refreshWishlistProductButtons(id);
        showToast('Could not sync this Wishlist change. Your previous saved state was restored.');
      }
    }
    async function toggleProductWishlist(productId){
      const id=String(productId||'');
      if(!id)return;
      return setWishlistProductSaved(id,!wishlistProductIds.includes(id));
    }
    async function removeWishlistProduct(productId){
      const id=String(productId||'');
      if(!id)return;
      return setWishlistProductSaved(id,false);
    }
    function renderWishlist(){
      const container=$('wishlistItemsContainer');
      if(!container)return;
      $('wishlistCountLabel').textContent=wishlistProductIds.length+' item'+(wishlistProductIds.length===1?'':'s');
      if(!wishlistProductIds.length){
        container.innerHTML='<div class="wishlist-empty"><span aria-hidden="true">♡</span><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it here.</p></div>';
        return;
      }
      container.innerHTML=wishlistProductIds.map(id=>{
        const product=products.find(item=>String(item.id)===String(id));
        if(!product){
          return '<article class="wishlist-item wishlist-item-missing"><div class="wishlist-product-placeholder">🛍️</div><div class="wishlist-item-info"><strong>Product no longer available</strong><p>This item may have been removed from the store.</p></div><button class="wishlist-remove-button" type="button" data-wishlist-remove="'+escapeHtml(id)+'" aria-label="Remove unavailable product from Wishlist">Remove</button></article>';
        }
        const imageUrl=safeCatalogImageUrl(product.image||(Array.isArray(product.images)?(product.images.find(image=>image&&image.url)||{}).url:''))||'';
        const image=imageUrl?'<img src="'+escapeHtml(imageUrl)+'" alt="'+escapeHtml(product.name)+'" loading="lazy" decoding="async">':'<span aria-hidden="true">'+escapeHtml(product.icon||'🛍️')+'</span>';
        const tracked=Array.isArray(product.variants);
        const inStock=!tracked||product.variants.some(variant=>Number(variant.stock)>0);
        const availability=tracked?(inStock?'<span class="wishlist-availability available">In stock</span>':'<span class="wishlist-availability unavailable">Out of stock</span>'):'';
        return '<article class="wishlist-item"><div class="wishlist-product-photo">'+image+'</div><div class="wishlist-item-info"><div class="wishlist-item-category">'+escapeHtml(product.cat||'GENMERCH')+'</div><strong>'+escapeHtml(product.name)+'</strong><div class="wishlist-item-price">'+money(product.price)+'</div>'+availability+'</div><div class="wishlist-item-actions"><button class="wishlist-view-button" type="button" data-wishlist-view="'+escapeHtml(product.id)+'">View product</button><button class="wishlist-remove-button" type="button" data-wishlist-remove="'+escapeHtml(product.id)+'">Remove</button></div></article>';
      }).join('');
    }
    const CUSTOMER_ORDER_STATUS_META={
      pending:{label:'Order placed',detail:'Your order was received and is waiting for the seller to confirm it.',step:0},
      confirmed:{label:'Order confirmed',detail:'The seller confirmed your order.',step:1},
      processing:{label:'Preparing Order',detail:'The seller is preparing your order for dispatch.',step:2},
      shipped:{label:'In Transit',detail:'Your order is in transit with the courier selected by GENMERCH.',step:3},
      out_for_delivery:{label:'Out for delivery',detail:'The courier is delivering your parcel to your address.',step:4},
      delivered:{label:'Order received',detail:'Your order is marked as delivered. Thank you for shopping with GENMERCH.',step:5},
      cancelled:{label:'Order cancelled',detail:'This order has been cancelled. Reserved stock is returned when applicable.',step:-1},
      refunded:{label:'Refunded',detail:'This order is marked as refunded. Check the payment method for refund details.',step:-1}
    };
    let customerOrdersRefreshTimer=null;
    let customerOrdersLoadSequence=0;
    let customerGuestTrackingSequence=0;
    let customerGuestTrackingLookup=null;
    let customerOrdersRealtimeChannel=null;
    let customerOrdersRealtimeUserId='';
    let customerOrdersRealtimeConnected=false;
    let customerOrdersBadgePollTimer=null;
    let customerOrdersBadgeRefreshSequence=0;

    let genmerchHeaderReadAt=null;
    async function getGenmerchHeaderReadAt(client,userId,forceRefresh){
      if(!client||!userId)return null;
      if(!forceRefresh&&genmerchHeaderReadAt&&genmerchHeaderReadAt.userId===userId)return genmerchHeaderReadAt.readAt;
      const result=await client.from('customer_header_read_state').select('read_at').eq('user_id',userId).maybeSingle();
      if(result.error)throw result.error;
      const readAt=result.data&&result.data.read_at?result.data.read_at:null;
      genmerchHeaderReadAt={userId:userId,readAt:readAt};
      const readButton=document.getElementById('customerOrdersMarkRead');
      if(readButton&&readAt){readButton.classList.add('is-read');readButton.textContent='✓ All caught up';readButton.setAttribute('aria-label','Header badges are synced as read');}
      return readAt;
    }
    window.getGenmerchHeaderReadAt=getGenmerchHeaderReadAt;
    async function markGenmerchHeaderBadgesRead(){
      const button=document.getElementById('customerOrdersMarkRead');
      try{
        const client=getCustomerAuthClient();
        const sessionResult=await client.auth.getSession();
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session;
        if(!session||!session.user)throw new Error('Please sign in to sync read status.');
        const userId=String(session.user.id);
        const stamp=new Date().toISOString();
        const saved=await client.from('customer_header_read_state').upsert({user_id:userId,read_at:stamp,updated_at:stamp},{onConflict:'user_id'}).select('read_at').single();
        if(saved.error)throw saved.error;
        genmerchHeaderReadAt={userId:userId,readAt:saved.data.read_at};
        await Promise.all([
          refreshCustomerOrdersBadge(session).catch(error=>console.warn('Orders badge refresh after mark read failed.',error)),
          refreshCustomerRateBadge().catch(error=>console.warn('Rate badge refresh after mark read failed.',error)),
          window.loadGenmerchNotifications?window.loadGenmerchNotifications():Promise.resolve()
        ]);
        if(button){button.classList.add('is-read');button.textContent='✓ All caught up';button.setAttribute('aria-label','All header badges marked as read');}
      }catch(error){
        console.error('GENMERCH could not save header read status to Supabase.',error);
        if(button){button.classList.remove('is-read');button.textContent='Try again';}
        alert('Hindi na-save ang read status sa database. Pakisubukan ulit.');
      }
    }
    window.markGenmerchHeaderBadgesRead=markGenmerchHeaderBadgesRead;
    function setCustomerOrdersBadgeCount(value){
      const badge=$('customerOrdersBadge');
      if(!badge)return;
      const numeric=Number(value);
      const count=Number.isFinite(numeric)?Math.max(0,Math.floor(numeric)):0;
      badge.textContent=count>99?'99+':String(count);
      badge.hidden=count===0;
      const button=badge.closest('button');
      if(button){
        button.setAttribute('aria-label',count?'View and track your orders, '+count+' order'+(count===1?'':'s'):'View and track your orders');
        button.title=count?'My Orders — '+count+' order'+(count===1?'':'s')+' · Track your delivery':'My Orders — Track your delivery';
      }
    }

    async function refreshCustomerOrdersBadge(session=customerAuthCurrentSession){
      const userId=session&&session.user&&session.user.id?String(session.user.id):'';
      if(!userId){customerOrdersBadgeRefreshSequence++;setCustomerOrdersBadgeCount(0);return;}
      const sequence=++customerOrdersBadgeRefreshSequence;
      const client=getCustomerAuthClient();
      const readAt=await getGenmerchHeaderReadAt(client,userId);
      let query=client.from('orders').select('id',{count:'exact',head:true}).eq('user_id',userId);
      if(readAt)query=query.gt('created_at',readAt);
      const result=await query;
      if(result.error)throw result.error;
      const activeUserId=customerAuthCurrentSession&&customerAuthCurrentSession.user&&customerAuthCurrentSession.user.id
        ?String(customerAuthCurrentSession.user.id):'';
      if(sequence!==customerOrdersBadgeRefreshSequence||activeUserId!==userId)return;
      setCustomerOrdersBadgeCount(result.count);
    }

    function stopCustomerOrdersBadgePolling(){
      if(customerOrdersBadgePollTimer!==null){
        window.clearInterval(customerOrdersBadgePollTimer);
        customerOrdersBadgePollTimer=null;
      }
    }

    function stopCustomerOrdersRealtimeChannel(){
      if(customerOrdersRealtimeChannel&&customerAuthClient&&typeof customerAuthClient.removeChannel==='function'){
        const previous=customerOrdersRealtimeChannel;
        customerOrdersRealtimeChannel=null;
        try{
          const removal=customerAuthClient.removeChannel(previous);
          if(removal&&typeof removal.catch==='function')removal.catch(()=>{});
        }catch(_){}
      }else{
        customerOrdersRealtimeChannel=null;
      }
      customerOrdersRealtimeUserId='';
      customerOrdersRealtimeConnected=false;
    }

    function startCustomerOrdersBadgePolling(){
      if(customerOrdersBadgePollTimer!==null)return;
      customerOrdersBadgePollTimer=window.setInterval(()=>{
        if(document.hidden)return;
        const session=customerAuthCurrentSession;
        if(session&&session.user){
          refreshCustomerOrdersBadge(session).catch(error=>console.warn('GENMERCH Orders badge fallback refresh failed.',error));
          refreshCustomerRateBadge(session).catch(error=>console.warn('GENMERCH RATE badge fallback refresh failed.',error));
        }
      },60000);
    }

    function syncCustomerOrdersBadgeRealtime(session=customerAuthCurrentSession){
      const userId=session&&session.user&&session.user.id?String(session.user.id):'';
      if(!userId){
        customerOrdersBadgeRefreshSequence++;
        stopCustomerOrdersBadgePolling();
        stopCustomerOrdersRealtimeChannel();
        setCustomerOrdersBadgeCount(0);
        return;
      }
      if(customerOrdersRealtimeChannel&&customerOrdersRealtimeUserId===userId){
        refreshCustomerOrdersBadge(session).catch(error=>console.warn('GENMERCH Orders badge refresh failed.',error));
        refreshCustomerRateBadge(session).catch(error=>console.warn('GENMERCH RATE badge refresh failed.',error));
        return;
      }
      stopCustomerOrdersRealtimeChannel();
      const client=getCustomerAuthClient();
      customerOrdersRealtimeUserId=userId;
      try{
        customerOrdersRealtimeChannel=client
          .channel('genmerch-customer-orders-'+userId)
          .on('postgres_changes',{
            event:'*',
            schema:'public',
            table:'orders',
            filter:'user_id=eq.'+userId
          },()=>{
            const activeSession=customerAuthCurrentSession;
            if(!activeSession||!activeSession.user||String(activeSession.user.id)!==userId)return;
            refreshCustomerOrdersBadge(activeSession).catch(error=>console.warn('GENMERCH realtime Orders badge update failed.',error));
            refreshCustomerRateBadge(activeSession).catch(error=>console.warn('GENMERCH realtime RATE badge update failed.',error));
            if($('customerOrdersOverlay')&&$('customerOrdersOverlay').classList.contains('open')){
              loadCustomerAccountOrders(true);
            }
          })
          .subscribe(status=>{
            if(customerOrdersRealtimeUserId!==userId)return;
            if(status==='SUBSCRIBED'){
              customerOrdersRealtimeConnected=true;
              stopCustomerOrdersBadgePolling();
            }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
              customerOrdersRealtimeConnected=false;
              console.warn('GENMERCH Orders Realtime is temporarily unavailable; enabling the slower fallback refresh.');
              startCustomerOrdersBadgePolling();
            }
          });
      }catch(error){
        customerOrdersRealtimeChannel=null;
        console.warn('GENMERCH could not start Orders Realtime; enabling the slower fallback refresh.',error);
        startCustomerOrdersBadgePolling();
      }
      refreshCustomerOrdersBadge(session).catch(error=>console.warn('GENMERCH initial Orders badge refresh failed.',error));
    }
    function customerOrderStatusMeta(status){
      return CUSTOMER_ORDER_STATUS_META[String(status||'pending').toLowerCase()]||{label:String(status||'Order update').replace(/_/g,' '),detail:'Your order status has been updated.',step:0};
    }
    function customerOrderDate(value){
      if(!value)return 'Waiting for update';
      const date=new Date(value);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
    }
    function customerOrderProgressMarkup(status){
      const normalizedStatus=String(status||'pending').toLowerCase();
      const current=customerOrderStatusMeta(normalizedStatus),steps=[
        {key:'pending',label:'Order placed'},
        {key:'confirmed',label:'Confirmed'},
        {key:'processing',label:'Preparing Order'},
        {key:'shipped',label:'In Transit'},
        {key:'out_for_delivery',label:'Out for delivery'},
        {key:'delivered',label:'Order received'}
      ];
      if(current.step<0)return '<div class="customer-order-cancelled-banner"><strong>'+escapeHtml(current.label)+'.</strong> '+escapeHtml(current.detail)+'</div>';
      return '<div class="customer-order-progress" role="list" aria-label="Order progress: '+escapeHtml(current.label)+'">'+steps.map((step,index)=>{
        const finished=index<current.step;
        const finalDelivered=normalizedStatus==='delivered'&&step.key==='delivered';
        const active=index===current.step&&normalizedStatus!=='delivered';
        const isCurrent=active||finalDelivered;
        const done=finished||finalDelivered;
        const stateClass=(done?' completed':'')+(active?' current':'')+(finalDelivered?' delivered-current':'');
        const marker=done?'✓':String(index+1);
        return '<div class="customer-order-progress-step'+stateClass+'" role="listitem"'+(isCurrent?' aria-current="step"':'')+'><span class="customer-order-progress-dot">'+marker+'</span><span class="customer-order-progress-label">'+escapeHtml(step.label)+'</span></div>';
      }).join('')+'</div>';
    }
    function customerOrderTimelineMarkup(history,status,order){
      const entries=Array.isArray(history)?history.slice():[];
      if(!entries.length)entries.push({from_status:null,to_status:status,note:customerOrderStatusMeta(status).detail,created_at:order.created_at});
      const latestStatus=String(status||'pending').toLowerCase();
      if(!entries.some(entry=>String(entry.to_status).toLowerCase()===latestStatus)){
        entries.push({from_status:null,to_status:latestStatus,note:customerOrderStatusMeta(latestStatus).detail,created_at:order.updated_at||order.created_at});
      }
      entries.sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
      return '<div class="customer-order-timeline"><h4>Order activity</h4><div class="customer-order-timeline-list">'+entries.map(entry=>{
        const meta=customerOrderStatusMeta(entry.to_status);
        return '<div class="customer-order-timeline-event"><span class="customer-order-timeline-marker"></span><div><div class="customer-order-timeline-title">'+escapeHtml(meta.label)+'</div><div class="customer-order-timeline-note">'+escapeHtml(entry.note||meta.detail)+'</div><div class="customer-order-timeline-date">'+escapeHtml(customerOrderDate(entry.created_at))+'</div></div></div>';
      }).join('')+'</div></div>';
    }
    function customerOrderItemsMarkup(items){
      if(!Array.isArray(items)||!items.length)return '<div class="customer-order-items"><h4>Items</h4><p class="customer-orders-empty">Item details are not available for this order.</p></div>';
      return '<div class="customer-order-items"><h4>Items ordered ('+items.reduce((sum,item)=>sum+(Number(item.quantity)||0),0)+' unit(s))</h4>'+items.map(item=>{
        const imageUrl=safeCatalogImageUrl(item.image_url_snapshot||item.image_url||'');
        const image=imageUrl?'<img class="customer-order-item-image" src="'+escapeHtml(imageUrl)+'" alt="'+escapeHtml(item.product_name||'Product')+'" loading="lazy" decoding="async">':'<div class="customer-order-item-image customer-order-item-noimage">👕</div>';
        return '<article class="customer-order-item">'+image+'<div class="customer-order-item-info"><strong>'+escapeHtml(item.product_name||'GENMERCH product')+'</strong><span>SKU: '+escapeHtml(item.sku||'—')+'</span><span>Size: '+escapeHtml(item.size_label||'—')+(item.color_label?' · Color: '+escapeHtml(item.color_label):'')+'</span><span>Qty: '+escapeHtml(item.quantity)+'</span></div><div class="customer-order-item-price">'+escapeHtml(money(item.line_total))+'</div></article>';
      }).join('')+'</div>';
    }
    function customerShipmentMarkup(shipment,orderStatus){
      if(!shipment||!shipment.courier_name)return '';
      const status=String(orderStatus||'').toLowerCase();
      const deliveryState=status==='delivered'?'Delivered':(status==='out_for_delivery'?'Out for delivery':'In Transit');
      return '<section class="customer-shipment-details" aria-label="Shipment details"><h4>🚚 Shipping Details</h4>'+
        '<div class="customer-shipment-row"><span>Courier</span><strong>'+escapeHtml(shipment.courier_name)+'</strong></div>'+
        '<div class="customer-shipment-row"><span>Delivery Reference #</span><strong class="customer-shipment-reference">'+escapeHtml(shipment.tracking_number||'—')+'</strong></div>'+
        '<div class="customer-shipment-row"><span>Shipment Status</span><strong>'+escapeHtml(deliveryState)+'</strong></div>'+
        (shipment.shipped_at?'<div class="customer-shipment-timestamp">Shipped: '+escapeHtml(customerOrderDate(shipment.shipped_at))+'</div>':'')+
        '</section>';
    }
    function customerOrderCardMarkup(order,items=[],history=[],shipment=null,guestMode=false){
      const status=String(order.status||'pending').toLowerCase(),meta=customerOrderStatusMeta(status);
      const paymentStatus=String(order.payment_status||'pending').toLowerCase();
      const paymentSettled=paymentStatus==='paid';
      const paymentWaiting=!paymentSettled&&!['cancelled','refunded'].includes(status)&&!['cancelled','refunded'].includes(paymentStatus);
      const deliveredButUnpaid=status==='delivered'&&!paymentSettled;
      const displayMeta=deliveredButUnpaid
        ?{label:'Awaiting seller to confirm payment',detail:'The delivery was marked complete, but the seller has not confirmed payment settlement yet.'}
        :meta;
      const shipmentData=shipment||order.shipment||null;
      const pillClass=deliveredButUnpaid?' payment-waiting':(status==='delivered'?' delivered':(['cancelled','refunded'].includes(status)?' '+status:''));
      const location=[order.shipping_city_municipality,order.shipping_province,order.shipping_postal_code].filter(Boolean).join(', ');
      const delivery=order.shipping_street_address
        ?'<div class="customer-order-delivery-details"><strong>Delivery to:</strong> '+escapeHtml(order.shipping_street_address)+(order.shipping_barangay?', '+escapeHtml(order.shipping_barangay):'')+(location?', '+escapeHtml(location):'')+(order.shipping_landmark?'<br><strong>Landmark:</strong> '+escapeHtml(order.shipping_landmark):'')+(order.delivery_instructions?'<br><strong>Instructions:</strong> '+escapeHtml(order.delivery_instructions):'')+'</div>'
        :'';
      const payment=paymentSettled
        ?'Payment confirmed as paid.'
        :(order.payment_method==='COD'
          ?'Cash on Delivery — awaiting seller confirmation that payment was received.'
          :String(order.payment_method||'Selected payment method')+' selected. Payment is '+paymentStatus.replace(/_/g,' ')+'.');
      const canConfirmReceipt=paymentSettled&&['shipped','out_for_delivery'].includes(status);
      const confirmReceipt=canConfirmReceipt
        ?(guestMode
          ?'<div class="customer-receipt-action"><p>Payment is settled. If you have physically received the parcel, confirm receipt below.</p><button type="button" class="customer-confirm-received-button" data-confirm-guest-received data-order-number="'+escapeHtml(order.order_number||'')+'">✓ Confirm Received</button></div>'
          :'<div class="customer-receipt-action"><p>Payment is settled. If you have physically received the parcel, confirm receipt below.</p><button type="button" class="customer-confirm-received-button" data-confirm-account-received data-order-id="'+escapeHtml(order.id||'')+'" data-order-number="'+escapeHtml(order.order_number||'')+'">✓ Confirm Received</button></div>')
        :'';
      const paymentGate=paymentWaiting
        ?'<section class="customer-payment-pending-note" role="status"><strong>Awaiting seller to confirm payment</strong><p>'+(deliveredButUnpaid
          ?'The seller marked delivery as completed, but payment is still Pending. The order will show Order Received after the seller confirms the payment has actually been received.'
          :'Please wait while the seller confirms that payment has actually been received. Confirm Received will become available only after payment is marked Paid.')+'</p><span>Payment status: '+escapeHtml(paymentStatus.replace(/_/g,' '))+'</span></section>'
        :'';
      const createdAtMs=new Date(order.created_at||'').getTime();
      const emailRetryAllowed=!guestMode&&Boolean(order.receipt_email&&order.customer_phone&&order.id&&order.order_number)
        &&Number.isFinite(createdAtMs)&&Date.now()>=createdAtMs&&Date.now()-createdAtMs<48*60*60*1000
        &&!['cancelled','refunded'].includes(status)&&!['cancelled','refunded'].includes(paymentStatus);
      const progressMarkup=deliveredButUnpaid
        ?'<div class="customer-order-payment-gated-progress">Delivery is recorded. Waiting for the seller to confirm payment before showing Order Received.</div>'
        :customerOrderProgressMarkup(status);
      const timelineHistory=deliveredButUnpaid
        ?(Array.isArray(history)?history.filter(entry=>String(entry.to_status||'').toLowerCase()!=='delivered'):[])
        :history;
      const timelineStatus=deliveredButUnpaid?'pending':status;
      return '<article class="customer-order-card"><div class="customer-order-card-head"><div><div class="customer-order-number">'+escapeHtml(order.order_number||'GENMERCH order')+'</div><div class="customer-order-date">Placed '+escapeHtml(customerOrderDate(order.created_at))+'</div><div class="customer-order-total">Total '+escapeHtml(money(order.total_amount))+'</div></div><div class="customer-order-status-pill'+pillClass+'">'+escapeHtml(displayMeta.label)+'</div></div>'+
        progressMarkup+
        '<section class="customer-order-current-status" aria-label="Latest order status"><div class="customer-order-current-status-kicker">LATEST ORDER UPDATE</div><p>'+escapeHtml(deliveredButUnpaid?'Delivery is recorded, but payment is pending. Please wait for the seller to confirm receipt of the payment.':meta.detail)+'</p><div class="customer-order-current-status-date">Last updated: '+escapeHtml(customerOrderDate(order.updated_at||order.created_at))+'</div></section>'+
        customerShipmentMarkup(shipmentData,status)+paymentGate+confirmReceipt+
        customerOrderTimelineMarkup(timelineHistory,timelineStatus,order)+customerOrderItemsMarkup(items)+delivery+
        '<div class="customer-order-payment-note"><strong>Payment:</strong> '+escapeHtml(payment)+'</div></article>';
    }
        const CUSTOMER_ORDER_FILTERS=[
      {key:'all',label:'All Orders',countId:'customerOrderCountAll'},
      {key:'to-confirm',label:'To Confirm',countId:'customerOrderCountToConfirm'},
      {key:'to-ship',label:'To Ship',countId:'customerOrderCountToShip'},
      {key:'to-receive',label:'To Receive',countId:'customerOrderCountToReceive'},
      {key:'awaiting-payment',label:'Awaiting Payment',countId:'customerOrderCountAwaitingPayment'},
      {key:'completed',label:'Completed',countId:'customerOrderCountCompleted'},
      {key:'cancelled',label:'Cancelled',countId:'customerOrderCountCancelled'}
    ];
    let customerOrderFilterActive='all';
    let customerAccountOrderRecords=[];

    function customerOrderMatchesFilter(record,filterKey){
      const status=String(record.order.status||'pending').toLowerCase();
      const payment=String(record.order.payment_status||'pending').toLowerCase();
      const cancelled=['cancelled','refunded'].includes(status);
      if(filterKey==='all')return true;
      if(filterKey==='to-confirm')return status==='pending';
      if(filterKey==='to-ship')return ['confirmed','processing'].includes(status);
      if(filterKey==='to-receive')return ['shipped','out_for_delivery'].includes(status);
      if(filterKey==='awaiting-payment')return !cancelled&&!['cancelled','refunded'].includes(payment)&&payment!=='paid';
      if(filterKey==='completed')return status==='delivered'&&payment==='paid';
      if(filterKey==='cancelled')return cancelled;
      return true;
    }

    function customerOrderSearchMatches(record,query){
      if(!query)return true;
      const order=record.order,shipment=record.shipment||{};
      const itemText=record.items.map(item=>[
        item.product_name,item.sku,item.size_label,item.color_label
      ].filter(Boolean).join(' ')).join(' ');
      const addressText=[
        order.shipping_street_address,order.shipping_barangay,order.shipping_city_municipality,
        order.shipping_province,order.shipping_postal_code,order.delivery_zone
      ].filter(Boolean).join(' ');
      const searchable=[
        order.order_number,order.status,order.payment_status,order.payment_method,
        shipment.courier_name,shipment.tracking_number,addressText,itemText
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query.toLowerCase());
    }

    function updateCustomerOrderFilterCounts(){
      CUSTOMER_ORDER_FILTERS.forEach(filter=>{
        const count=filter.key==='all'
          ?customerAccountOrderRecords.length
          :customerAccountOrderRecords.filter(record=>customerOrderMatchesFilter(record,filter.key)).length;
        const countNode=$(filter.countId);
        if(countNode)countNode.textContent=String(count);
      });
      const tabs=$('customerOrdersFilterTabs');
      if(tabs){
        tabs.querySelectorAll('[data-customer-order-filter]').forEach(button=>{
          const active=button.dataset.customerOrderFilter===customerOrderFilterActive;
          button.classList.toggle('active',active);
          button.setAttribute('aria-selected',active?'true':'false');
          button.tabIndex=active?0:-1;
        });
      }
    }

    function renderCustomerOrderFilterResults(){
      const container=$('customerOrdersList');
      if(!container)return;
      const searchNode=$('customerOrdersSearch');
      const query=searchNode?searchNode.value.trim():'';
      const clearButton=$('customerOrdersSearchClear');
      if(clearButton)clearButton.hidden=!query;
      updateCustomerOrderFilterCounts();
      const currentFilter=CUSTOMER_ORDER_FILTERS.find(filter=>filter.key===customerOrderFilterActive)||CUSTOMER_ORDER_FILTERS[0];
      const matches=customerAccountOrderRecords.filter(record=>
        customerOrderMatchesFilter(record,customerOrderFilterActive)&&customerOrderSearchMatches(record,query)
      );
      const summary=$('customerOrdersFilterSummary');
      if(summary){
        const detail=query?'Matching orders: '+matches.length:
          (customerOrderFilterActive==='all'?'Showing all orders':('Showing '+currentFilter.label.toLowerCase()));
        summary.textContent=detail+(customerOrderFilterActive==='awaiting-payment'?' · Includes delivered orders awaiting seller payment confirmation.':'');
      }
      if(!customerAccountOrderRecords.length){
        container.innerHTML='<div class="customer-orders-empty"><strong>No account orders yet</strong>Orders placed while signed in will appear here. Guest orders can be found below using your order number and checkout mobile number.</div>';
        return;
      }
      if(!matches.length){
        const emptyTitle=query?'No matching orders found':'No orders in this category yet';
        const emptyDetail=query?'Try another order number, product name, courier or reference number.':'Choose another status tab to see more of your orders.';
        container.innerHTML='<div class="customer-orders-empty customer-orders-filter-empty"><strong>'+escapeHtml(emptyTitle)+'</strong>'+escapeHtml(emptyDetail)+(customerOrderFilterActive!=='all'?'<button type="button" data-customer-show-all-orders>View all orders</button>':'')+'</div>';
        return;
      }
      container.innerHTML=matches.map(record=>customerOrderCardMarkup(
        record.order,record.items,record.history,record.shipment,false
      )).join('');
    }

    function renderCustomerAccountOrders(orders,itemRows=[],histories=[],shipmentRows=[]){
      const container=$('customerOrdersList');
      if(!container)return;
      const itemMap=new Map(),historyMap=new Map(),shipmentMap=new Map();
      itemRows.forEach(item=>{
        const key=String(item.order_id);
        if(!itemMap.has(key))itemMap.set(key,[]);
        itemMap.get(key).push(item);
      });
      histories.forEach(entry=>{
        const key=String(entry.order_id);
        if(!historyMap.has(key))historyMap.set(key,[]);
        historyMap.get(key).push(entry);
      });
      shipmentRows.forEach(shipment=>{
        const key=String(shipment.order_id);
        if(!shipmentMap.has(key))shipmentMap.set(key,shipment);
      });
      customerAccountOrderRecords=(Array.isArray(orders)?orders:[]).map(order=>({
        order,
        items:itemMap.get(String(order.id))||[],
        history:historyMap.get(String(order.id))||[],
        shipment:shipmentMap.get(String(order.id))||null
      }));
      renderCustomerOrderFilterResults();
    }
    async function loadCustomerAccountOrders(silent=false){
      const container=$('customerOrdersList');
      if(!container)return;
      const requestSequence=++customerOrdersLoadSequence;
      try{
        const client=getCustomerAuthClient();
        const sessionResult=await client.auth.getSession();
        if(requestSequence!==customerOrdersLoadSequence)return;
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session;
        customerAuthCurrentSession=session&&session.user?session:null;
        const banner=$('customerOrdersAccountBanner');
        if(!session||!session.user){
          if(banner)banner.innerHTML='You are browsing as a guest. Sign in to see orders linked to your account, or use <strong>Track a guest order</strong> below.';
          setCustomerOrdersBadgeCount(0);
          container.removeAttribute('aria-busy');
          renderCustomerAccountOrders([]);
          return;
        }
        const userId=String(session.user.id);
        if(banner)banner.innerHTML='Signed in as <strong>'+escapeHtml(getCustomerAuthIdentity(session.user))+'</strong>. Only orders linked to this account are shown here.';
        if(!silent){
          container.setAttribute('aria-busy','true');
          container.innerHTML='<div class="customer-orders-loading">Fetching your latest orders from Supabase…</div>';
        }
        const ordersResult=await client.from('orders').select('id,order_number,status,payment_method,payment_status,subtotal,shipping_fee,total_amount,delivery_zone,shipping_street_address,shipping_barangay,shipping_city_municipality,shipping_province,shipping_postal_code,shipping_landmark,delivery_instructions,customer_phone,receipt_email,created_at,updated_at',{count:'exact'}).eq('user_id',userId).order('created_at',{ascending:false}).limit(50);
        if(requestSequence!==customerOrdersLoadSequence)return;
        if(ordersResult.error)throw ordersResult.error;
        const orders=Array.isArray(ordersResult.data)?ordersResult.data:[];
        setCustomerOrdersBadgeCount(typeof ordersResult.count==='number'?ordersResult.count:orders.length);
        if(!orders.length){
          container.removeAttribute('aria-busy');
          renderCustomerAccountOrders([]);
          return;
        }
        const orderIds=orders.map(order=>order.id);
        const [itemsResult,historyResult,shipmentsResult]=await Promise.all([
          client.from('order_items').select('id,order_id,product_name,sku,size_label,color_label,unit_price,quantity,line_total,image_url_snapshot,created_at').in('order_id',orderIds).order('created_at',{ascending:true}),
          client.from('order_status_history').select('id,order_id,from_status,to_status,note,created_at').in('order_id',orderIds).order('created_at',{ascending:true}),
          client.from('shipments').select('id,order_id,courier_name,tracking_number,tracking_url,status,shipped_at,delivered_at,updated_at').in('order_id',orderIds).order('updated_at',{ascending:false})
        ]);
        if(requestSequence!==customerOrdersLoadSequence)return;
        if(itemsResult.error)throw itemsResult.error;
        if(historyResult.error)throw historyResult.error;
        if(shipmentsResult.error)throw shipmentsResult.error;
        container.removeAttribute('aria-busy');
        renderCustomerAccountOrders(orders,Array.isArray(itemsResult.data)?itemsResult.data:[],Array.isArray(historyResult.data)?historyResult.data:[],Array.isArray(shipmentsResult.data)?shipmentsResult.data:[]);
      }catch(error){
        if(requestSequence!==customerOrdersLoadSequence)return;
        container.removeAttribute('aria-busy');
        if(!silent)container.innerHTML='<div class="customer-orders-empty"><strong>Orders could not be loaded</strong>'+escapeHtml(error.message||'Please try opening My Orders again when your connection is available.')+'</div>';
        else console.warn('GENMERCH could not sync the latest customer orders from Supabase.',error);
      }
    }
    function setGuestTrackMessage(message,type=''){
      const node=$('customerGuestTrackMessage');
      node.textContent=message||'';
      node.className='customer-orders-message'+(type?' '+type:'');
      node.hidden=!message;
    }
    async function trackGuestOrder(orderNumber,phone,silent=false){
      const requestSequence=++customerGuestTrackingSequence;
      const client=getCustomerAuthClient();
      const result=await client.rpc('track_genmerch_guest_order',{p_order_number:String(orderNumber||'').trim(),p_customer_phone:String(phone||'').trim()});
      if(requestSequence!==customerGuestTrackingSequence)return;
      if(result.error)throw result.error;
      const order=Array.isArray(result.data)?result.data[0]:result.data;
      if(!order||!order.order_number)throw new Error('Order details not found. Check the order number and mobile number.');
      customerGuestTrackingLookup={orderNumber:String(orderNumber||'').trim(),phone:String(phone||'').trim()};
      $('customerGuestTrackResult').innerHTML=customerOrderCardMarkup(order,order.items||[],order.timeline||[],order.shipment||null,true);
      setGuestTrackMessage('Order found. The latest status and item details were loaded from Supabase.','success');
    }
    async function confirmAccountOrderReceived(orderId,orderNumber,button){
      if(!orderId)return;
      if(!window.confirm('Confirm that order '+(orderNumber||'this order')+' has been received? This will mark the delivery as complete.'))return;
      if(button){button.disabled=true;button.textContent='Confirming…';}
      try{
        const client=getCustomerAuthClient();
        const result=await client.rpc('confirm_genmerch_order_received',{p_order_id:orderId});
        if(result.error)throw result.error;
        await maybeSendGenmerchDeliverySurveyEmail(client,{order_id:orderId});
        await loadCustomerAccountOrders(true);
        showToast('Thank you! Order '+(orderNumber||'')+' is marked as received.');
      }catch(error){
        setGuestTrackMessage(error.message||'Could not confirm receipt. Please refresh your orders and try again.','error');
        if(button){button.disabled=false;button.textContent='✓ Confirm Received';}
      }
    }
    async function confirmGuestOrderReceived(orderNumber,button){
      const phone=customerGuestTrackingLookup&&customerGuestTrackingLookup.orderNumber.toUpperCase()===String(orderNumber||'').toUpperCase()
        ?customerGuestTrackingLookup.phone:$('customerTrackPhone').value.trim();
      if(!phone){setGuestTrackMessage('Enter the checkout mobile number used for this order.','error');return;}
      if(!window.confirm('Confirm that order '+(orderNumber||'this order')+' has been received? This will mark the delivery as complete.'))return;
      if(button){button.disabled=true;button.textContent='Confirming…';}
      try{
        const client=getCustomerAuthClient();
        const result=await client.rpc('confirm_genmerch_guest_order_received',{p_order_number:orderNumber,p_customer_phone:phone});
        if(result.error)throw result.error;
        await maybeSendGenmerchDeliverySurveyEmail(client,{order_number:orderNumber,customer_phone:phone});
        await trackGuestOrder(orderNumber,phone,true);
        setGuestTrackMessage('Thank you! Receipt confirmed and your order is now marked as received.','success');
      }catch(error){
        setGuestTrackMessage(error.message||'Could not confirm receipt. Please refresh your order and try again.','error');
        if(button){button.disabled=false;button.textContent='✓ Confirm Received';}
      }
    }
    async function resendCustomerOrderEmail(button){
      const card=button.closest('.customer-order-email-retry');
      const resultNode=card?card.querySelector('.customer-order-email-retry-result'):null;
      const orderId=String(button.dataset.orderId||'').trim();
      const orderNumber=String(button.dataset.orderNumber||'').trim();
      const phone=String(button.dataset.orderPhone||'').trim();
      const recipient=String(button.dataset.orderEmail||'').trim().toLowerCase();
      if(!orderId||!orderNumber||!phone||!recipient){
        if(resultNode)resultNode.textContent='Missing order details. Refresh My Orders and try again.';
        return;
      }
      const originalText=button.textContent;
      button.disabled=true;
      button.textContent='Sending…';
      if(resultNode){resultNode.className='customer-order-email-retry-result';resultNode.textContent='Checking the saved order and sending the email…';}
      try{
        const client=getCustomerAuthClient();
        const response=await client.functions.invoke('send-genmerch-order-confirmation',{
          body:{order_id:orderId,order_number:orderNumber,customer_phone:phone,recipient_email:recipient}
        });
        if(response.error)throw response.error;
        const data=response.data||{};
        if(!data.ok)throw new Error(data.message||'The email provider did not confirm sending the order details.');
        if(resultNode){
          resultNode.classList.add('success');
          resultNode.textContent=data.already_sent
            ?'The system already records this email as sent to '+(data.recipient_email||recipient)+'. Check Inbox and Spam/Junk.'
            :'Order details emailed to '+(data.recipient_email||recipient)+'. Check Inbox and Spam/Junk.';
        }
        button.textContent=data.already_sent?'Already sent':'Email sent';
      }catch(error){
        let message=error&&error.message?error.message:'The confirmation email could not be sent right now.';
        if(error&&error.context&&typeof error.context.json==='function'){
          try{const body=await error.context.json();if(body&&body.message)message=body.message;}catch(_){}
        }
        if(resultNode){
          resultNode.classList.add('error');
          resultNode.textContent='Email not sent: '+message+' Your order is still saved; keep the order number and retry after the issue is fixed.';
        }
        button.textContent='↻ Retry email';
        button.disabled=false;
        return;
      }
      button.disabled=false;
      if(button.textContent==='Email sent'||button.textContent==='Already sent')button.disabled=true;
      if(originalText==='Sending…')button.textContent='↻ Retry email';
    }
    async function openCustomerOrders(){
      const overlay=$('customerOrdersOverlay');
      if(!overlay)return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';

      // Always perform a fresh Supabase read when the panel opens or reopens.
      await loadCustomerAccountOrders();
      if(!overlay.classList.contains('open'))return;

      // Re-run the guest lookup too so previously displayed guest order details
      // are refreshed rather than left on an older status after reopening.
      if(customerGuestTrackingLookup){
        $('customerTrackOrderNumber').value=customerGuestTrackingLookup.orderNumber;
        $('customerTrackPhone').value=customerGuestTrackingLookup.phone;
        $('customerGuestTrackResult').innerHTML='<div class="customer-orders-loading">Checking the latest guest order status…</div>';
        setGuestTrackMessage('Syncing the latest guest order status…');
        try{
          await trackGuestOrder(customerGuestTrackingLookup.orderNumber,customerGuestTrackingLookup.phone,true);
        }catch(error){
          $('customerGuestTrackResult').innerHTML='';
          setGuestTrackMessage(error.message||'The latest guest order status could not be loaded. Please check your connection and try again.','error');
        }
      }
      if(overlay.classList.contains('open'))startCustomerOrdersRefresh();
    }
    function closeCustomerOrders(){
      const overlay=$('customerOrdersOverlay');
      if(!overlay)return;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      // Prevent a previous request from replacing the latest data after a reopen.
      customerOrdersLoadSequence++;
      customerGuestTrackingSequence++;
      stopCustomerOrdersRefresh();
      if(!document.querySelector('.customer-orders-overlay.open,.wishlist-overlay.open,.cart-overlay.open,.cart-modal.open,.overlay.open,.customer-auth-overlay.open,.seller-modal-overlay.open,.size-overlay.open'))document.body.style.overflow='';
    }
    function startCustomerOrdersRefresh(){
      if(customerOrdersRefreshTimer!==null)return;
      customerOrdersRefreshTimer=window.setInterval(async()=>{
        if(document.hidden||!$('customerOrdersOverlay').classList.contains('open'))return;
        const session=customerAuthCurrentSession;
        if(session&&session.user){
          if(!customerOrdersRealtimeConnected)await loadCustomerAccountOrders(true);
        }else if(customerGuestTrackingLookup){
          try{await trackGuestOrder(customerGuestTrackingLookup.orderNumber,customerGuestTrackingLookup.phone,true);}catch(_){}
        }
      },60000);
    }
    function stopCustomerOrdersRefresh(){if(customerOrdersRefreshTimer!==null){window.clearInterval(customerOrdersRefreshTimer);customerOrdersRefreshTimer=null;}}
    $('customerOrdersClose').addEventListener('click',closeCustomerOrders);
    $('customerOrdersFilterTabs').addEventListener('click',event=>{
      const button=event.target.closest('[data-customer-order-filter]');
      if(!button)return;
      customerOrderFilterActive=button.dataset.customerOrderFilter||'all';
      renderCustomerOrderFilterResults();
    });
    $('customerOrdersFilterTabs').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=Array.from($('customerOrdersFilterTabs').querySelectorAll('[data-customer-order-filter]'));
      if(!tabs.length)return;
      event.preventDefault();
      const current=Math.max(0,tabs.findIndex(button=>button.dataset.customerOrderFilter===customerOrderFilterActive));
      const next=event.key==='Home'?0:(event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length);
      customerOrderFilterActive=tabs[next].dataset.customerOrderFilter;
      renderCustomerOrderFilterResults();
      tabs[next].focus();
    });
    $('customerOrdersSearch').addEventListener('input',renderCustomerOrderFilterResults);
    $('customerOrdersSearchClear').addEventListener('click',()=>{
      $('customerOrdersSearch').value='';
      renderCustomerOrderFilterResults();
      $('customerOrdersSearch').focus();
    });
    $('customerOrdersOverlay').addEventListener('click',event=>{
      if(event.target===$('customerOrdersOverlay')){event.preventDefault();event.stopPropagation();return;}
      const resendEmailButton=event.target.closest('[data-resend-order-email]');
      if(resendEmailButton){resendCustomerOrderEmail(resendEmailButton);return;}
      const accountButton=event.target.closest('[data-confirm-account-received]');
      if(accountButton){confirmAccountOrderReceived(accountButton.dataset.orderId,accountButton.dataset.orderNumber,accountButton);return;}
      const guestButton=event.target.closest('[data-confirm-guest-received]');
      if(guestButton){confirmGuestOrderReceived(guestButton.dataset.orderNumber,guestButton);return;}
      const showAllButton=event.target.closest('[data-customer-show-all-orders]');
      if(showAllButton){customerOrderFilterActive='all';renderCustomerOrderFilterResults();}
    });
    $('customerGuestTrackForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const orderNumber=$('customerTrackOrderNumber').value.trim(),phone=$('customerTrackPhone').value.trim(),button=$('customerTrackSubmit');
      if(!/^GM-[0-9]{8}-[A-F0-9]{8}$/i.test(orderNumber)){
        setGuestTrackMessage('Enter the full GENMERCH order number shown in your confirmation.','error');$('customerTrackOrderNumber').focus();return;
      }
      if(!/^09[0-9]{9}$/.test(phone)){
        setGuestTrackMessage('Enter the 11-digit mobile number used at checkout.','error');$('customerTrackPhone').focus();return;
      }
      button.disabled=true;button.textContent='Searching…';setGuestTrackMessage('Checking your order details securely…');$('customerGuestTrackResult').innerHTML='';
      try{await trackGuestOrder(orderNumber,phone);}
      catch(error){customerGuestTrackingLookup=null;setGuestTrackMessage(error.message||'Order details not found. Check the order number and mobile number.','error');$('customerGuestTrackResult').innerHTML='';}
      finally{button.disabled=false;button.textContent='Track my order';}
    });

    async function openWishlist(){
      $('wishlistOverlay').classList.add('open');
      $('wishlistOverlay').setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      $('wishlistItemsContainer').innerHTML='<div class="wishlist-empty genmerch-inline-loading"><h3>Syncing your Wishlist…</h3><p>Loading saved products from your account.</p></div>';
      await syncWishlistForCustomerSession(undefined,false);
      renderWishlist();
      if(wishlistCloudSyncError&&customerAuthCurrentSession&&customerAuthCurrentSession.user)showToast('Could not connect to your cloud Wishlist. Showing this device’s saved items for now.');
    }
    async function waitForPendingWishlistWrites(){
      while(wishlistWriteChains.size){
        const pendingWrites=[...wishlistWriteChains.values()];
        await Promise.allSettled(pendingWrites);
      }
    }
    let wishlistClosePromise=null;
    async function closeWishlist(){
      const overlay=$('wishlistOverlay');
      if(!overlay)return;
      if(wishlistClosePromise)return wishlistClosePromise;
      wishlistClosePromise=(async()=>{
        const buttons=[...overlay.querySelectorAll('button')];
        const previousDisabledStates=buttons.map(button=>button.disabled);
        if(wishlistWriteChains.size){
          overlay.setAttribute('aria-busy','true');
          buttons.forEach(button=>{button.disabled=true;});
          try{
            await waitForPendingWishlistWrites();
          }finally{
            buttons.forEach((button,index)=>{button.disabled=previousDisabledStates[index];});
            overlay.removeAttribute('aria-busy');
          }
        }
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden','true');
        if(!document.querySelector('.customer-orders-overlay.open,.wishlist-overlay.open,.cart-overlay.open,.cart-modal.open,.overlay.open,.customer-auth-overlay.open,.seller-modal-overlay.open,.size-overlay.open'))document.body.style.overflow='';
      })();
      try{
        await wishlistClosePromise;
      }finally{
        wishlistClosePromise=null;
      }
    }
    $('wishlistCloseButton').addEventListener('click',closeWishlist);
    $('wishlistContinueButton').addEventListener('click',closeWishlist);
    $('syncCustomerDataButton').addEventListener('click',syncCustomerDataNow);
    $('wishlistOverlay').addEventListener('click',event=>{if(event.target===$('wishlistOverlay')){event.preventDefault();event.stopPropagation();}});
    $('wishlistItemsContainer').addEventListener('click',async event=>{
      const remove=event.target.closest('[data-wishlist-remove]');
      if(remove){event.preventDefault();event.stopPropagation();removeWishlistProduct(remove.dataset.wishlistRemove);return;}
      const view=event.target.closest('[data-wishlist-view]');
      if(view){const id=view.dataset.wishlistView;await closeWishlist();openProduct(id);}
    });

    function renderCategoryFilters(){
      const visibleProducts = getProductsWithImages();
      const uniqueCategories = [...new Set(visibleProducts.map(product => product.cat).filter(Boolean))];
      const nav = $('categoryFilters');
      const allButton = `<button class="category ${currentCategory === 'All' ? 'active' : ''}" data-category="All" type="button">All Items (${visibleProducts.length})</button>`;
      const categoryButtons = uniqueCategories.map(category => {
        const count = visibleProducts.filter(product => product.cat === category).length;
        const icon = categoryIcons[category] || '🛍️';
        const active = currentCategory === category ? 'active' : '';
        return `<button class="category ${active}" data-category="${escapeHtml(category)}" type="button">${icon} ${escapeHtml(category)} (${count})</button>`;
      }).join('');
      nav.innerHTML = allButton + categoryButtons;
      const visibleCategoryNames = new Set(uniqueCategories.map(category => category.toLowerCase()));
      document.querySelectorAll('.desktop-links button[onclick*="setCategoryByLabel"]').forEach(button => {
        const match = button.getAttribute('onclick').match(/setCategoryByLabel\('([^']+)'\)/);
        if (match) button.style.display = visibleCategoryNames.has(match[1].toLowerCase()) ? '' : 'none';
      });
    }

    function setCategoryByLabel(label){
      const match = [...new Set(getProductsWithImages().map(product => product.cat).filter(Boolean))]
        .find(category => category.toLowerCase() === label.toLowerCase() || category.toLowerCase().includes(label.toLowerCase()));
      if (!match) {
        showInfo(label);
        return;
      }
      currentCategory = match;
      $('searchInput').value = '';
      renderCategoryFilters();
      renderProducts();
      document.getElementById('categoryFilters').scrollIntoView({behavior:'smooth',block:'nearest'});
    }

    function resetCatalog(){
      currentCategory='All';
      $('searchInput').value='';
      renderCategoryFilters();
      renderProducts();
      window.scrollTo({top:0,behavior:'smooth'});
    }

    let categoryPickerOverlay = null;
    let categoryPickerPreviousFocus = null;

    function ensureCategoryPicker(){
      if(categoryPickerOverlay)return categoryPickerOverlay;
      const overlay=document.createElement('div');
      overlay.className='gm-category-picker-overlay';
      overlay.id='gmCategoryPickerOverlay';
      overlay.setAttribute('aria-hidden','true');
      overlay.innerHTML='<section class="gm-category-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="gmCategoryPickerTitle" tabindex="-1">'+
        '<header class="gm-category-picker-header"><div class="gm-category-picker-heading"><span class="gm-category-picker-eyebrow">GENMERCH COLLECTIONS</span><h2 id="gmCategoryPickerTitle">Shop by Category</h2><p>Choose a collection to explore the available products.</p></div>'+
        '<button class="gm-category-picker-close" type="button" data-category-picker-close aria-label="Close categories">×</button></header>'+
        '<div class="gm-category-picker-grid" id="gmCategoryPickerGrid" aria-live="polite"></div>'+
        '<p class="gm-category-picker-footnote">Categories and product counts update from the active GENMERCH catalog.</p></section>';
      document.body.appendChild(overlay);
      categoryPickerOverlay=overlay;
      overlay.addEventListener('click',function(event){
        if(event.target===overlay || (event.target instanceof Element && event.target.closest('[data-category-picker-close]'))){closeCategoryPicker();return;}
        const choice=event.target instanceof Element?event.target.closest('[data-category-picker-value]'):null;
        if(!choice)return;
        const value=choice.getAttribute('data-category-picker-value')||'__all__';
        currentCategory=value==='__all__'?'All':value;
        const search=$('searchInput');if(search)search.value='';
        renderCategoryFilters();renderProducts();closeCategoryPicker();
        window.setTimeout(function(){const heading=$('productSectionTitle');if(heading)heading.scrollIntoView({behavior:'smooth',block:'start'});},80);
      });
      document.addEventListener('keydown',function(event){
        if(event.key==='Escape' && categoryPickerOverlay&&categoryPickerOverlay.classList.contains('is-open')){event.preventDefault();closeCategoryPicker();}
      });
      return overlay;
    }

    function renderCategoryPicker(){
      const overlay=ensureCategoryPicker(),grid=overlay.querySelector('#gmCategoryPickerGrid');
      if(!grid)return;
      const visibleProducts=getProductsWithImages(),groups=new Map();
      visibleProducts.forEach(product=>{
        const name=String(product.cat||'').trim();if(!name)return;
        if(!groups.has(name))groups.set(name,[]);groups.get(name).push(product);
      });
      const orderedNames=Array.from(groups.keys()).sort((a,b)=>{
        const ai=catalogCategoryOrder.findIndex(name=>name.toLowerCase()===a.toLowerCase());
        const bi=catalogCategoryOrder.findIndex(name=>name.toLowerCase()===b.toLowerCase());
        if(ai>=0&&bi>=0)return ai-bi;if(ai>=0)return -1;if(bi>=0)return 1;
        return a.localeCompare(b,'en',{sensitivity:'base'});
      });
      function card(value,label,count,product,icon){
        const image=product&&(product.image||(Array.isArray(product.images)?(product.images.find(item=>item&&item.url)||{}).url:''));
        const url=image?safeCatalogImageUrl(image):'';
        const visual=url?'<img src="'+escapeHtml(url)+'" alt="'+escapeHtml((product&&product.imageAlt)||label)+'" loading="lazy" decoding="async">':
          '<span class="gm-category-picker-fallback" aria-hidden="true">'+escapeHtml(icon||'🛍️')+'</span>';
        return '<button class="gm-category-picker-card" type="button" data-category-picker-value="'+escapeHtml(value)+'">'+
          '<span class="gm-category-picker-image">'+visual+'<span class="gm-category-picker-image-shade" aria-hidden="true"></span></span>'+
          '<span class="gm-category-picker-card-copy"><strong>'+escapeHtml(label)+'</strong><small>'+count+' '+(count===1?'product':'products')+'</small></span>'+
          '<span class="gm-category-picker-arrow" aria-hidden="true">›</span></button>';
      }
      if(!visibleProducts.length){
        grid.innerHTML='<div class="gm-category-picker-empty"><span aria-hidden="true">🛍️</span><strong>No active product categories yet</strong><p>Available collections will appear here as products are published in Seller Centre.</p></div>';return;
      }
      grid.innerHTML=card('__all__','All Products',visibleProducts.length,visibleProducts[0],'🛍️')+
        orderedNames.map(name=>{const rows=groups.get(name)||[];return card(name,name,rows.length,rows[0],categoryIcons[name]||'🛍️');}).join('');
    }

    function openCategoryPicker(){
      const overlay=ensureCategoryPicker();categoryPickerPreviousFocus=document.activeElement;
      renderCategoryPicker();overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');
      document.body.classList.add('gm-category-picker-open');
      const close=overlay.querySelector('[data-category-picker-close]');if(close)window.requestAnimationFrame(()=>close.focus());
    }
    function closeCategoryPicker(){
      if(!categoryPickerOverlay||!categoryPickerOverlay.classList.contains('is-open'))return;
      categoryPickerOverlay.classList.remove('is-open');categoryPickerOverlay.setAttribute('aria-hidden','true');
      document.body.classList.remove('gm-category-picker-open');
      const target=categoryPickerPreviousFocus&&categoryPickerPreviousFocus.isConnected?categoryPickerPreviousFocus:document.querySelector('.bottom-nav [data-gm-nav="categories"]');
      if(target&&typeof target.focus==='function')target.focus();categoryPickerPreviousFocus=null;
    }
    window.addEventListener('genmerch:open-category-picker',openCategoryPicker);

    function renderProducts(){
      const query=normalizeCatalogSearchText($('searchInput').value);
      const searchTerms=query?getCatalogSearchTerms(query):[];
      const list=getProductsWithImages().filter(product=>{
        // A typed search always searches the complete active catalog, regardless of the selected category.
        if(searchTerms.length)return productMatchesCatalogSearch(product,searchTerms);
        return currentCategory==='All'||product.cat===currentCategory;
      });
      const title=currentCategory==='All'?'Suot Apparel — All Products':(categoryIcons[currentCategory]||'🛍️')+' '+currentCategory+' Collection';
      $('productSectionTitle').textContent=title;
      const stateText=catalogLoadState==='connected'?' · Supabase connected':catalogLoadState==='fallback'?' · Offline demo catalog':' · Connecting…';
      $('productCount').textContent=list.length+' '+(list.length===1?'product':'products')+stateText;
      if(!list.length){$('productGrid').innerHTML='<div class="empty-state"><div class="emoji">🛍️</div><h3>No Products Found</h3><p>Try another keyword or select a different product category.</p></div>';return;}
      $('productGrid').innerHTML=list.map(product=>{
        const tracked=Array.isArray(product.variants), outOfStock=tracked&&!product.variants.some(variant=>variant.stock>0);
        const visual=product.image?'<img class="catalog-card-image" src="'+escapeHtml(product.image)+'" alt="'+escapeHtml(product.imageAlt||product.name)+'" loading="lazy" decoding="async">':'<span class="catalog-card-placeholder" aria-hidden="true">'+escapeHtml(product.icon||'🛍️')+'</span>';
        const label=product.isDemo===false?'STORE':'DEMO ONLY';
        const stockText=tracked?(outOfStock?'Out of stock':product.totalStock+' in stock'):(product.sold||'Demo item');
        return '<article class="card" data-product-id="'+escapeHtml(product.id)+'" tabindex="0" aria-label="View '+escapeHtml(product.name)+'"><div class="card-img">'+visual+'<span class="discount">'+escapeHtml(product.off||'DEMO')+'</span></div>'+
          '<div class="card-body"><div class="card-topline"><div class="product-type">'+escapeHtml(product.cat)+' · '+label+'</div><button class="card-wishlist-button'+(isProductWishlisted(product.id)?' active':'')+'" type="button" data-wishlist-id="'+escapeHtml(product.id)+'" aria-label="'+(isProductWishlisted(product.id)?'Remove '+escapeHtml(product.name)+' from wishlist':'Add '+escapeHtml(product.name)+' to wishlist')+'" title="'+(isProductWishlisted(product.id)?'Saved to Wishlist':'Add to Wishlist')+'" aria-pressed="'+String(isProductWishlisted(product.id))+'"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button></div><div class="card-title">'+escapeHtml(product.name)+'</div><div class="price">'+(product.promotionType==='percent'&&product.regularPrice>product.price?'<span class="genmerch-price-before">'+money(product.regularPrice)+'</span> ':'')+money(product.price)+'</div><div class="card-sales-review genmerch-inline-loading" data-card-sales-review="'+escapeHtml(product.id)+'" aria-label="Product sold count and customer ratings">Loading sales &amp; reviews…</div>'+(product.promotionType&&product.promotionType!=='none'?'<div class="genmerch-promo-caption">'+escapeHtml(product.promotionLabel||'Promotion')+'</div>':'')+'<div class="sold">'+escapeHtml(stockText)+'</div>'+
          '<button class="add-btn" data-add-id="'+escapeHtml(product.id)+'" type="button" '+(outOfStock?'disabled aria-label="Out of stock"':'')+'>'+(outOfStock?'Out of Stock':'+ Add to Cart')+'</button></div></article>';
      }).join('');
      loadProductCardSalesReviews(list);
    }

    function escapeHtml(text){
      return String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    $('categoryFilters').addEventListener('click',event=>{
      const button = event.target.closest('[data-category]');
      if(!button) return;
      currentCategory = button.dataset.category;
      renderCategoryFilters();
      renderProducts();
    });
    // Run an explicit search, then move the customer to the results whether matches exist or not.
    function performCatalogSearch(){
      renderProducts();
      const resultsHeading=$('productSectionTitle');
      if(!resultsHeading) return;
      window.requestAnimationFrame(()=>{
        resultsHeading.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      });
    }

    // Keep live filtering while typing; only explicit searches trigger auto-scroll.
    $('searchInput').addEventListener('input',renderProducts);
    $('searchButton').addEventListener('click',performCatalogSearch);
    $('searchInput').addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        performCatalogSearch();
      }
    });

    $('productGrid').addEventListener('click',event=>{
      const wishlistButton=event.target.closest('[data-wishlist-id]');
      if(wishlistButton){
        event.preventDefault();
        event.stopPropagation();
        toggleProductWishlist(wishlistButton.dataset.wishlistId);
        return;
      }
      const addButton=event.target.closest('[data-add-id]');
      if(addButton){
        event.preventDefault();
        event.stopPropagation();
        openProduct(addButton.dataset.addId,false,true);
        return;
      }
      const card=event.target.closest('[data-product-id]');
      if(card)openProduct(card.dataset.productId);
    });
    $('productGrid').addEventListener('keydown',event=>{
      if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-product-id]')){event.preventDefault();openProduct(event.target.dataset.productId);}
    });

    function getProductColors(product){
      const variants=Array.isArray(product&&product.variants)?product.variants:[];
      const unique=[...new Set(variants.map(variant=>String(variant.color||'').trim()).filter(Boolean))];
      if(unique.length<2)return unique;
      const images=Array.isArray(product.images)?product.images:[];
      const ordered=[];
      images.forEach(image=>{
        const match=getColorForImage(image,unique);
        if(match&&!ordered.includes(match))ordered.push(match);
      });
      unique.forEach(color=>{if(!ordered.includes(color))ordered.push(color);});
      return ordered;
    }
    // Match explicit image metadata, including labels separated by punctuation or an em dash.
    function getColorForImage(image,colors){
      const explicit=String(image&&(image.colorLabel||image.color_label)||'').trim().replace(/\s+/g,' ');
      if(explicit){
        const matched=(colors||[]).find(color=>String(color||'').trim().replace(/\s+/g,' ').toLowerCase()===explicit.toLowerCase());
        if(matched)return matched;
      }
      const alt=' '+String(image&&image.alt||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
      return (colors||[]).find(color=>{
        const normalized=String(color).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
        return normalized && alt.includes(' '+normalized+' ');
      })||'';
    }
    // Show color buttons only when every color has a distinct, explicit gallery-image match.
    // Incomplete or ambiguous mappings fall back to the gallery-only layout.
    function getProductColorMapping(product,imageList=null){
      const colors=getProductColors(product);
      if(colors.length<1)return null;
      const images=Array.isArray(imageList)?imageList:(Array.isArray(product&&product.images)?product.images:[]);
      const matched=new Map();
      images.forEach((image,index)=>{
        const color=getColorForImage(image,colors);
        if(color&&!matched.has(color))matched.set(color,index);
      });
      if(colors.some(color=>!matched.has(color)))return null;
      const mappedIndexes=[...matched.values()];
      if(new Set(mappedIndexes).size!==colors.length)return null;
      return {colors:[...matched.keys()],imageIndexByColor:matched};
    }
    function getProductImageForColor(product,color){
      const label=sellerNormalizeColorLabel(color);
      if(!label)return String(product&&product.image||'');
      const images=Array.isArray(product&&product.images)?product.images:[];
      const match=images.find(image=>sellerNormalizeColorLabel(image&&image.colorLabel)===label);
      return match&&match.url?match.url:String(product&&product.image||'');
    }
    function updateColorChoices(containerId,labelId,colors,selectedColor){
      const container=$(containerId),label=$(labelId);
      if(!container||!label)return;
      container.innerHTML=(colors||[]).map(color=>'<button type="button" class="product-color-choice'+(color===selectedColor?' active':'')+'" data-color="'+escapeHtml(color)+'" aria-pressed="'+String(color===selectedColor)+'">'+escapeHtml(color)+'</button>').join('');
      label.textContent=selectedColor||'Choose color';
      container.querySelectorAll('[data-color]').forEach(button=>{
        const active=button.dataset.color===selectedColor;
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',String(active));
      });
    }
    function showProductGalleryImage(product,images,index,thumbnails){
      const selected=images[index];if(!selected)return;
      openProductGalleryIndex=index;
      const main=$('productGalleryMainImage');
      if(main){main.src=selected.url;main.alt=selected.alt||product.name;}
      if(thumbnails){
        thumbnails.querySelectorAll('[data-gallery-index]').forEach(thumb=>{
          const active=Number(thumb.dataset.galleryIndex)===index;
          thumb.classList.toggle('active',active);
          thumb.setAttribute('aria-pressed',String(active));
        });
      }
      const colorMapping=getProductColorMapping(product,images);
      if(colorMapping){
        const imageColor=getColorForImage(selected,colorMapping.colors);
        if(imageColor){
          const colorChanged=openProductSelectedColor!==imageColor;
          openProductSelectedColor=imageColor;
          if(colorChanged){
            productDetailColorConfirmed=false;
            productDetailSelectedSize='';
            productDetailSelectedVariantId=null;
            productDetailSelectedColor='';
            productDetailQuantity=1;
          }
          updateColorChoices('productModalColorChoices','productModalSelectedColor',colorMapping.colors,productDetailColorConfirmed?imageColor:'');
          if(colorChanged){
            renderProductModalSizes(product);
            updateProductModalAddButton(product);
            updateProductOptionsValidationNotice(product);
          }
        }
      }
    }

    function getProductGallerySwipeIndexes(product,images){
      const colorMapping=getProductColorMapping(product,images);
      if(colorMapping&&colorMapping.colors.length>1){
        return [...colorMapping.imageIndexByColor.values()].sort((a,b)=>a-b);
      }
      return (images||[]).map((_,index)=>index);
    }
    // Shared navigation hook for the enlarged image viewer; keeps the selected color/variant in sync.
    window.navigateGenmerchProductGallery=function(direction){
      if(!openProductGalleryProduct||openProductGallerySwipeIndexes.length<2)return null;
      const indexes=openProductGallerySwipeIndexes;
      let current=indexes.indexOf(openProductGalleryIndex);
      if(current<0)current=0;
      const nextPosition=(current+(Number(direction)<0?-1:1)+indexes.length)%indexes.length;
      const nextIndex=indexes[nextPosition];
      showProductGalleryImage(openProductGalleryProduct,openProductGalleryImages,nextIndex,openProductGalleryThumbnails);
      const selected=openProductGalleryImages[nextIndex];
      const color=getColorForImage(selected,getProductColors(openProductGalleryProduct));
      flashProductSwipeHint(color?'Showing '+color+' variant':'Photo '+(nextIndex+1)+' of '+openProductGalleryImages.length,1450);
      return selected||null;
    };
    function clearProductSwipeHintTimers(){
      if(productSwipeHintTimer!==null){window.clearTimeout(productSwipeHintTimer);productSwipeHintTimer=null;}
      if(productSwipeHintHideTimer!==null){window.clearTimeout(productSwipeHintHideTimer);productSwipeHintHideTimer=null;}
    }
    function flashProductSwipeHint(message,duration=3200){
      const hint=$('productSwipeHint');
      if(!hint)return;
      clearProductSwipeHintTimers();
      hint.textContent=message;
      hint.hidden=false;
      hint.classList.remove('is-visible');
      window.requestAnimationFrame(()=>hint.classList.add('is-visible'));
      productSwipeHintTimer=window.setTimeout(()=>{
        hint.classList.remove('is-visible');
        productSwipeHintHideTimer=window.setTimeout(()=>{hint.hidden=true;},260);
      },duration);
    }
    function showProductSwipeHint(productId,canSwipe){
      const hint=$('productSwipeHint');
      if(!hint)return;
      if(!canSwipe){
        clearProductSwipeHintTimers();
        hint.classList.remove('is-visible');
        hint.hidden=true;
        return;
      }
      const key='genmerch:product-swipe-hint-shown:v1:'+String(productId||'');
      try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(_){}
      flashProductSwipeHint('↔ Swipe the image to see other variants',3600);
    }
    function handleProductGallerySwipeEnd(event){
      const start=productGallerySwipeStart;
      if(!start||start.pointerId!==event.pointerId)return;
      productGallerySwipeStart=null;
      if(openProductGallerySwipeIndexes.length<2||!openProductGalleryProduct)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.abs(dx)<42||Math.abs(dx)<Math.abs(dy)*1.25)return;
      const indexes=openProductGallerySwipeIndexes;
      let current=indexes.indexOf(openProductGalleryIndex);
      if(current<0){
        current=indexes.reduce((best,index,pos)=>Math.abs(index-openProductGalleryIndex)<Math.abs(indexes[best]-openProductGalleryIndex)?pos:best,0);
      }
      const nextPosition=(current+(dx<0?1:-1)+indexes.length)%indexes.length;
      const nextIndex=indexes[nextPosition];
      showProductGalleryImage(openProductGalleryProduct,openProductGalleryImages,nextIndex,openProductGalleryThumbnails);
      // Stop the synthetic click after a swipe from accidentally opening the zoom viewer.
      productGallerySuppressClickUntil=Date.now()+500;
      const selected=openProductGalleryImages[nextIndex];
      const color=getColorForImage(selected,getProductColors(openProductGalleryProduct));
      flashProductSwipeHint(color?'Showing '+color+' variant':'Photo '+(nextIndex+1)+' of '+openProductGalleryImages.length,1450);
    }
    const productGalleryGestureStage=$('productModalIcon');
    if(productGalleryGestureStage){
      productGalleryGestureStage.addEventListener('pointerdown',event=>{
        const target=event.target instanceof Element?event.target:null;
        if(!target||!target.closest('#productGalleryMainImage')||openProductGallerySwipeIndexes.length<2)return;
        if(event.pointerType==='mouse'&&event.button!==0)return;
        productGallerySwipeStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
      },{passive:true});
      productGalleryGestureStage.addEventListener('click',event=>{
        if(Date.now()<productGallerySuppressClickUntil){
          event.preventDefault();
          event.stopPropagation();
        }
      },true);
    }
    document.addEventListener('pointerup',handleProductGallerySwipeEnd,true);
    document.addEventListener('pointercancel',event=>{
      if(productGallerySwipeStart&&productGallerySwipeStart.pointerId===event.pointerId)productGallerySwipeStart=null;
    },true);

    function openProduct(id,skipBackgroundRefresh=false,openOptionsImmediately=false){
      const p=products.find(item=>String(item.id)===String(id));
      if(!p){
        refreshCatalogForLiveStock().then(()=>{
          if(products.some(item=>String(item.id)===String(id)))openProduct(id,true);
          else showToast('This product is no longer available. Please refresh the catalogue.');
        }).catch(error=>{
          console.warn('GENMERCH catalogue refresh failed while opening product details.',error);
          showToast('Product details are temporarily unavailable. Please try again.');
        });
        return;
      }
      if(!skipBackgroundRefresh)refreshProductVariantsInBackground(p.id);
      openProductDetailId=p.id;
      updateWishlistDetailButton(p.id);
      productDetailSelectedSize='';
      productDetailSelectedVariantId=null;
      productDetailSelectedColor='';
      productDetailColorConfirmed=false;
      productOptionValidationAttempted=false;
      productDetailQuantity=1;
      productOptionsExpanded=false;
      const validationNotice=$('productModalValidationNotice');
      if(validationNotice){validationNotice.hidden=true;validationNotice.dataset.state='';}
      $('productModalTitle').textContent='Product Details';
      const images=(Array.isArray(p.images)?p.images:[]).filter(image=>image&&image.url);
      if(!images.length&&p.image)images.push({url:p.image,alt:p.imageAlt||p.name});
      const colorMapping=getProductColorMapping(p,images);
      const colors=getProductColors(p);
      const mainImage=images[0]||null;
      openProductSelectedColor=colors.length?(getColorForImage(mainImage,colors)||colors[0]):'';
      $('productModalIcon').innerHTML=mainImage?'<img id="productGalleryMainImage" src="'+escapeHtml(mainImage.url)+'" alt="'+escapeHtml(mainImage.alt||p.name)+'">':escapeHtml(p.icon||'🛍️');
      const enlargeHint=$('productImageEnlargeHint');if(enlargeHint)enlargeHint.hidden=!mainImage;
      const gallery=$('productModalGallery'), thumbnails=$('productGalleryThumbnails');
      openProductGalleryProduct=p;
      openProductGalleryImages=images;
      openProductGalleryThumbnails=thumbnails;
      openProductGallerySwipeIndexes=getProductGallerySwipeIndexes(p,images);
      openProductGalleryIndex=0;
      if(images.length>1){
        gallery.hidden=false;
        thumbnails.innerHTML=images.map((image,index)=>'<button type="button" class="product-gallery-thumb'+(index===0?' active':'')+'" data-gallery-index="'+index+'" aria-label="View photo '+(index+1)+' of '+images.length+'" aria-pressed="'+(index===0?'true':'false')+'"><img src="'+escapeHtml(image.url)+'" alt="" loading="lazy" decoding="async"></button>').join('');
        thumbnails.onclick=event=>{
          const button=event.target.closest('[data-gallery-index]');if(!button)return;
          showProductGalleryImage(p,images,Number(button.dataset.galleryIndex),thumbnails);
        };
      }else{gallery.hidden=true;thumbnails.replaceChildren();thumbnails.onclick=null;}
      showProductSwipeHint(p.id,openProductGallerySwipeIndexes.length>1);
      const colorSelector=$('productModalColorSelector');
      colorSelector.hidden=true;
      updateColorChoices('productModalColorChoices','productModalSelectedColor',colors,'');
      $('productModalColorChoices').onclick=event=>{
        const button=event.target.closest('[data-color]');if(!button)return;
        const selectedColor=String(button.dataset.color||'');
        const colorChanged=openProductSelectedColor!==selectedColor;
        openProductSelectedColor=selectedColor;
        productDetailColorConfirmed=Boolean(selectedColor);
        productDetailSelectedColor=selectedColor;
        updateColorChoices('productModalColorChoices','productModalSelectedColor',colors,productDetailColorConfirmed?selectedColor:'');
        if(colorMapping){
          const index=colorMapping.imageIndexByColor.get(selectedColor);
          if(Number.isInteger(index))showProductGalleryImage(p,images,index,thumbnails);
        }
        if(colorChanged){
          productDetailSelectedSize='';productDetailSelectedVariantId=null;productDetailQuantity=1;
          renderProductModalSizes(p);
        }
        updateProductModalAddButton(p);
        updateProductOptionsValidationNotice(p);
      };
      $('productModalName').textContent=p.name;
      $('productModalPrice').textContent=money(p.price);
      $('productModalSocialProof').innerHTML='<span class="sold">Loading sold count…</span><span class="rating">Loading ratings…</span>';
      $('productModalDescription').textContent=p.desc;
      renderProductModalSizes(p);
      updateProductModalAddButton(p);
      $('productModalAdd').onclick=()=>handleProductDetailPurchase('add-to-cart');
      $('productModalBuyNow').onclick=()=>handleProductDetailPurchase('buy-now');
      setProductPurchaseStage(Boolean(openOptionsImmediately),p);
      $('productOverlay').classList.add('open');$('productOverlay').setAttribute('aria-hidden','false');
      loadProductSalesStats(p.id);
      loadProductReviews(p.id);
      refreshCustomerRateBadge();
    }
    function getProductOptionRequirements(product){
      const hasColorOptions=Boolean(product&&getProductColors(product).length);
      const colorSelected=!hasColorOptions||(productDetailColorConfirmed&&Boolean(productDetailSelectedColor));
      const sizeSelected=Boolean(productDetailSelectedSize);
      return {hasColorOptions,colorSelected,sizeSelected,needsColor:!colorSelected,needsSize:!sizeSelected,complete:colorSelected&&sizeSelected};
    }
    function updateProductOptionsValidationNotice(product){
      const notice=$('productModalValidationNotice');
      const message=$('productModalValidationMessage');
      if(!notice||!message)return;
      const requirements=getProductOptionRequirements(product);
      const missing=[];
      if(requirements.needsColor)missing.push('color');
      if(requirements.needsSize)missing.push('size');
      if(!productOptionsExpanded||!productOptionValidationAttempted||!missing.length){
        notice.hidden=true;
        notice.dataset.state='';
        message.textContent='';
        return;
      }
      const text=missing.length===2
        ?'Please select your preferred color and size to continue.'
        :missing[0]==='color'
          ?'Please select your preferred color to continue.'
          :'Please select your preferred size to continue.';
      message.textContent=text;
      notice.dataset.state=missing.join('-');
      notice.hidden=false;
    }
    function validateProductOptionSelections(product){
      productOptionValidationAttempted=true;
      const requirements=getProductOptionRequirements(product);
      updateProductOptionsValidationNotice(product);
      if(requirements.complete)return true;
      const target=requirements.needsColor
        ?$('productModalColorSelector')
        :$('productModalSizeSelector');
      if(target)target.scrollIntoView({behavior:'smooth',block:'center'});
      const choice=requirements.needsColor
        ?$('productModalColorChoices')?.querySelector('button:not(:disabled)')
        :$('productModalSizeOptions')?.querySelector('button:not(:disabled)');
      if(choice&&typeof choice.focus==='function')choice.focus({preventScroll:true});
      return false;
    }

    function setProductPurchaseStage(expanded,product){
      productOptionsExpanded=Boolean(expanded);
      if(!productOptionsExpanded){
        productOptionValidationAttempted=false;
        const notice=$('productModalValidationNotice');
        if(notice){notice.hidden=true;notice.dataset.state='';}
      }
      const colorSelector=$('productModalColorSelector');
      if(colorSelector)colorSelector.hidden=!(productOptionsExpanded&&product&&getProductColors(product).length>0);
      const sizeSelector=$('productModalSizeSelector');
      if(sizeSelector)sizeSelector.hidden=!productOptionsExpanded;
      const quantitySelector=$('productModalQuantitySelector');
      if(quantitySelector)quantitySelector.hidden=!productOptionsExpanded;
      const hint=$('productModalOptionsHint');
      if(hint)hint.hidden=!productOptionsExpanded;
      const ratings=$('productModalRatings');
      if(ratings)ratings.hidden=productOptionsExpanded;
      const modal=document.querySelector('#productOverlay .product-modal');
      if(modal)modal.classList.toggle('product-modal-options-expanded',productOptionsExpanded);
      const back=$('productModalBack');
      if(back)back.hidden=!productOptionsExpanded;
      const title=$('productModalTitle');
      if(title)title.textContent=productOptionsExpanded?'Product Options':'Product Details';
      if(product)updateProductModalAddButton(product);
    }
    function renderProductModalSizes(product){
      const options=$('productModalSizeOptions');
      if(!options)return;
      options.replaceChildren();
      const colorMapping=getProductColorMapping(product);
      const productColors=getProductColors(product);
      const order=['Small','Medium','Large','Extra Size','Free Size'];
      const allVariants=Array.isArray(product.variants)
        ? product.variants.slice()
        : GENMERCH_ALLOWED_SIZES.map(size=>({id:null,size,color:'',price:null,stock:null,sku:''}));
      let variants=productColors.length&&openProductSelectedColor
        ? allVariants.filter(variant=>String(variant.color||'').trim().toLowerCase()===String(openProductSelectedColor).trim().toLowerCase())
        : allVariants;
      variants.sort((a,b)=>{
        const aIndex=order.indexOf(a.size),bIndex=order.indexOf(b.size);
        return (aIndex<0?99:aIndex)-(bIndex<0?99:bIndex) ||
          String(a.color||'').localeCompare(String(b.color||''));
      });
      variants.forEach(variant=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='product-detail-size-option';
        button.dataset.size=variant.size;
        if(variant.id)button.dataset.variantId=String(variant.id);
        if(variant.color)button.dataset.color=String(variant.color);
        button.dataset.stock=variant.stock===null||variant.stock===undefined?'':String(variant.stock);
        const appendColor=!productColors.length&&variant.color;
        button.textContent=displaySizeLabel(variant.size)+(appendColor?' · '+variant.color:'');
        const isSelected=variant.id
          ? String(variant.id)===String(productDetailSelectedVariantId||'')
          : (!productDetailSelectedVariantId && variant.size===productDetailSelectedSize &&
             (!variant.color||variant.color===productDetailSelectedColor));
        button.classList.toggle('active',Boolean(isSelected));
        button.setAttribute('aria-pressed',String(Boolean(isSelected)));
        const soldOut=variant.stock!==null&&variant.stock!==undefined&&Number(variant.stock)<1;
        button.disabled=Boolean(soldOut);
        if(soldOut){
          button.setAttribute('aria-label',displaySizeLabel(variant.size)+(variant.color?' '+variant.color:'')+' size, out of stock');
          button.title='Out of stock';
        }
        options.appendChild(button);
      });
      const selectedLabel=productDetailSelectedSize
        ? displaySizeLabel(productDetailSelectedSize)+(productDetailSelectedColor?' · '+productDetailSelectedColor:'')
        : 'Choose size';
      $('productModalSelectedSize').textContent=selectedLabel;
      updateProductModalQuantityControls(product);
      const available=variants.some(variant=>variant.stock===null||variant.stock===undefined||Number(variant.stock)>0);
      $('productModalSizeHint').textContent=variants.length===0
        ? 'No size options are available.'
        : available
          ? 'Select your size.'
          : 'All sizes are currently out of stock.';
    }
    function updateProductModalQuantityControls(product){
      const minus=$('productModalQuantityMinus');
      const plus=$('productModalQuantityPlus');
      const value=$('productModalQuantityValue');
      if(!minus||!plus||!value)return;
      productDetailQuantity=Math.max(1,Math.floor(Number(productDetailQuantity)||1));
      value.textContent=String(productDetailQuantity);
      const hasSize=Boolean(productDetailSelectedSize);
      const variantAware=Array.isArray(product.variants);
      const selectedVariant=variantAware
        ? product.variants.find(item=>String(item.id)===String(productDetailSelectedVariantId||''))
        : null;
      const stock=selectedVariant?Number(selectedVariant.stock):null;
      const existing=selectedVariant
        ? cart.find(item=>String(item.id)===String(product.id)&&String(item.variantId||'')===String(selectedVariant.id))
        : null;
      const remaining=variantAware&&Number.isFinite(stock)?Math.max(0,stock-(existing?Number(existing.qty)||0:0)):null;
      const canAdjust=hasSize&&(!variantAware||Boolean(selectedVariant&&Number.isFinite(remaining)&&remaining>0));
      minus.disabled=!canAdjust||productDetailQuantity<=1;
      plus.disabled=!canAdjust||(variantAware&&productDetailQuantity>=remaining);
    }
    function changeProductModalQuantity(delta){
      const product=products.find(item=>String(item.id)===String(openProductDetailId));
      if(!product||!productDetailSelectedSize)return;
      if(Array.isArray(product.variants)){
        const selectedVariant=product.variants.find(item=>String(item.id)===String(productDetailSelectedVariantId||''));
        if(!selectedVariant||Number(selectedVariant.stock)<1)return;
        productDetailQuantity=Math.min(Number(selectedVariant.stock),Math.max(1,productDetailQuantity+delta));
      }else{
        productDetailQuantity=Math.max(1,productDetailQuantity+delta);
      }
      updateProductModalQuantityControls(product);
      updateProductModalAddButton(product);
    }
    $('productModalQuantityMinus').addEventListener('click',()=>changeProductModalQuantity(-1));
    $('productModalQuantityPlus').addEventListener('click',()=>changeProductModalQuantity(1));
    function updateProductModalAddButton(product){
      const addButton=$('productModalAdd');
      const buyButton=$('productModalBuyNow');
      updateProductModalQuantityControls(product);
      if(!productOptionsExpanded){
        // Keep the overview footer actionable so customers can open options even if some/all sizes are sold out.
        addButton.textContent='Add to Cart';buyButton.textContent='Buy Now';
        addButton.disabled=false;buyButton.disabled=false;
        return;
      }
      const requirements=getProductOptionRequirements(product);
      let canAttemptPurchase=!requirements.complete;
      if(requirements.complete){
        canAttemptPurchase=true;
        if(Array.isArray(product.variants)){
          const selectedVariant=product.variants.find(item=>String(item.id)===String(productDetailSelectedVariantId||''));
          const stock=selectedVariant?Number(selectedVariant.stock):0;
          const existing=selectedVariant
            ? cart.find(item=>String(item.id)===String(product.id)&&String(item.variantId||'')===String(selectedVariant.id))
            : null;
          const remaining=selectedVariant?Math.max(0,stock-(existing?Number(existing.qty)||0:0)):0;
          canAttemptPurchase=Boolean(selectedVariant&&Number.isFinite(stock)&&remaining>=productDetailQuantity&&remaining>0);
        }
      }
      addButton.textContent='Add to Cart';
      buyButton.textContent='Buy Now';
      addButton.disabled=!canAttemptPurchase;
      buyButton.disabled=!canAttemptPurchase;
      updateProductOptionsValidationNotice(product);
    }
    async function handleProductDetailPurchase(action){
      const addButton=$('productModalAdd'),buyButton=$('productModalBuyNow');
      const currentForOptions=products.find(item=>String(item.id)===String(openProductDetailId));
      if(!currentForOptions){showToast('This product is no longer available.');return;}
      if(!productOptionsExpanded){
        setProductPurchaseStage(true,currentForOptions);
        const optionsTarget=!$('productModalColorSelector').hidden?$('productModalColorSelector'):$('productModalSizeSelector');
        if(optionsTarget)optionsTarget.scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
      if(!validateProductOptionSelections(currentForOptions))return;
      addButton.disabled=true;buyButton.disabled=true;
      try{
        const currentProduct=products.find(item=>String(item.id)===String(openProductDetailId));
        if(!currentProduct){showToast('This product is no longer available.');closeProduct();return;}
        renderProductModalSizes(currentProduct);
        updateProductModalAddButton(currentProduct);
        if(!validateProductOptionSelections(currentProduct))return;
        if(Array.isArray(currentProduct.variants)){
          const selectedVariant=currentProduct.variants.find(item=>String(item.id)===String(productDetailSelectedVariantId||''));
          if(!selectedVariant||Number(selectedVariant.stock)<1){
            $('productModalSizeHint').textContent='This size is out of stock. Please choose an available size.';
            showToast('This size is currently out of stock.');return;
          }
          const existing=cart.find(item=>String(item.id)===String(currentProduct.id)&&String(item.variantId||'')===String(selectedVariant.id));
          if((existing?Number(existing.qty)||0:0)+productDetailQuantity>Number(selectedVariant.stock)){showToast('The requested quantity exceeds current live stock.');return;}
        }
        const added=addToCart(currentProduct.id,productDetailSelectedSize,productDetailSelectedVariantId,productDetailQuantity);
        if(!added)return;
        closeProduct();
        if(action==='buy-now'){
          openCart();const nameField=$('firstName');
          if(nameField){nameField.scrollIntoView({behavior:'smooth',block:'center'});nameField.focus({preventScroll:true});}
        }
      }catch(error){console.error('GENMERCH could not verify live stock before purchase.',error);showToast('Unable to verify live stock. Please try again.');}
      finally{
        if(isCenteredActionStatusLoading())hideCenteredActionStatus();
        const product=products.find(item=>String(item.id)===String(openProductDetailId));
        if($('productOverlay').classList.contains('open')&&product)updateProductModalAddButton(product);
      }
    }
    $('productModalSizeOptions').addEventListener('click',event=>{
      const button=event.target.closest('[data-size]');
      if(!button||button.disabled)return;
      const product=products.find(item=>String(item.id)===String(openProductDetailId));
      if(!product)return;
      productDetailSelectedSize=button.dataset.size||'';
      productDetailSelectedVariantId=button.dataset.variantId||null;
      productDetailSelectedColor=button.dataset.color||'';
      productDetailQuantity=1;
      $('productModalSizeOptions').querySelectorAll('[data-size]').forEach(option=>{
        const active=option===button;
        option.classList.toggle('active',active);
        option.setAttribute('aria-pressed',String(active));
      });
      $('productModalSelectedSize').textContent=displaySizeLabel(productDetailSelectedSize)+
        (productDetailSelectedColor?' · '+productDetailSelectedColor:'');
      const stock=button.dataset.stock===''?null:Number(button.dataset.stock);
      $('productModalSizeHint').textContent=stock===null
        ? 'Selected size: '+displaySizeLabel(productDetailSelectedSize)+'.'
        : stock<1
          ? 'Selected size is currently out of stock.'
          : 'Selected size: '+displaySizeLabel(productDetailSelectedSize)+' · '+stock+' in stock.';
      updateProductModalAddButton(product);
      updateProductOptionsValidationNotice(product);
    });
    function closeProduct(){
      productOptionValidationAttempted=false;
      productDetailColorConfirmed=false;
      const notice=$('productModalValidationNotice');
      if(notice){notice.hidden=true;notice.dataset.state='';}
      $('productOverlay').classList.remove('open');
      $('productOverlay').setAttribute('aria-hidden','true');
    }
    $('productModalBack').addEventListener('click',()=>{
      const product=products.find(item=>String(item.id)===String(openProductDetailId));
      if(product)setProductPurchaseStage(false,product);
    });
    $('closeProductModal').addEventListener('click',closeProduct);
    $('productOverlay').addEventListener('click',event=>{if(event.target===$('productOverlay')){event.preventDefault();event.stopPropagation();}});

    function cartLineKey(item){
      return `${item.id}|${item.variantId || ''}|${item.size}`;
    }

    function renderSizeVariants(product){
      const options=$('sizeOptions');options.replaceChildren();
      const colorMapping=getProductColorMapping(product);
      const variantColors=getProductColors(product);
      const allVariants=Array.isArray(product.variants)?product.variants:GENMERCH_ALLOWED_SIZES.map(size=>({id:null,size,color:'',price:null,stock:null,sku:''}));
      const variants=colorMapping?allVariants.filter(variant=>variant.color===openProductSelectedColor):allVariants;
      let inStock=0;
      variants.forEach(variant=>{
        const button=document.createElement('button');button.type='button';button.className='size-option';button.dataset.size=variant.size;
        if(variant.id)button.dataset.variantId=variant.id;
        button.dataset.stock=variant.stock===null?'':String(variant.stock);
        const soldOut=variant.stock!==null&&variant.stock<1;button.disabled=soldOut;button.setAttribute('aria-pressed','false');
        const showColorOnSize=!colorMapping&&variantColors.length>1&&variant.color;
        button.textContent=displaySizeLabel(variant.size)+(showColorOnSize?' · '+variant.color:'')+(soldOut?' — Out of stock':(variant.price!==null&&variant.price!==product.price?' · '+money(variant.price):''));
        options.appendChild(button);if(!soldOut)inStock++;
      });
      const colorForHint=colorMapping?openProductSelectedColor:'';
      $('sizeSelectionHint').textContent=Array.isArray(product.variants)?(inStock?'Select an available size before adding this product to your cart.':'All sizes for '+(colorForHint?colorForHint+' ':'')+'are currently out of stock.'):'No size selected yet.';
      $('confirmSizeButton').disabled=true;
    }
    function openSizeSelector(id,skipBackgroundRefresh=false){
      const product=products.find(item=>String(item.id)===String(id));
      if(!product){
        refreshCatalogForLiveStock().then(()=>{
          if(products.some(item=>String(item.id)===String(id)))openSizeSelector(id,true);
          else showToast('This product is no longer available. Please refresh the catalogue.');
        }).catch(error=>{
          console.warn('GENMERCH catalogue refresh failed while opening size selection.',error);
          showToast('Size options are temporarily unavailable. Please try again.');
        });
        return;
      }
      if(!skipBackgroundRefresh)refreshProductVariantsInBackground(product.id);
      pendingSizeProductId=product.id;pendingSelectedSize='';pendingSelectedVariantId=null;
      $('sizeProductName').textContent=product.name;
      const colorMapping=getProductColorMapping(product);
      const colors=colorMapping?colorMapping.colors:[];
      if(colorMapping&&!colors.includes(openProductSelectedColor))openProductSelectedColor=colors[0];
      if(!colorMapping)openProductSelectedColor='';
      const colorSelector=$('sizeColorSelector');
      colorSelector.hidden=!colorMapping;
      updateColorChoices('sizeColorChoices','sizeSelectedColor',colors,openProductSelectedColor);
      $('sizeColorChoices').onclick=event=>{
        const button=event.target.closest('[data-color]');if(!button||!colorMapping)return;
        openProductSelectedColor=button.dataset.color;
        pendingSelectedSize='';pendingSelectedVariantId=null;
        updateColorChoices('sizeColorChoices','sizeSelectedColor',colors,openProductSelectedColor);
        $('sizeInstruction').textContent='Selected color: '+openProductSelectedColor+'. Select a size before adding this product to your cart.';
        renderSizeVariants(product);
      };
      $('sizeInstruction').textContent=colorMapping
        ?'Selected color: '+openProductSelectedColor+'. Select a size before adding this product to your cart.'
        :'Select a size before adding this product to your cart.';
      renderSizeVariants(product);
      $('sizeOverlay').classList.add('open');$('sizeOverlay').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
      $('sizeOptions').querySelector('button:not(:disabled)')?.focus();
    }
    function closeSizeSelector(){
      $('sizeOverlay').classList.remove('open');
      $('sizeOverlay').setAttribute('aria-hidden','true');
      pendingSizeProductId=null;
      pendingSelectedSize='';pendingSelectedVariantId=null;
      if(!$('cartModal').classList.contains('open') &&
         !$('productOverlay').classList.contains('open') &&
         !$('noticeOverlay').classList.contains('open')){
        document.body.style.overflow='';
      }
    }

    $('sizeOptions').addEventListener('click',event=>{
      const button=event.target.closest('[data-size]');if(!button||button.disabled)return;
      pendingSelectedSize=button.dataset.size;pendingSelectedVariantId=button.dataset.variantId||null;
      $('sizeOptions').querySelectorAll('[data-size]').forEach(option=>{const active=option===button;option.classList.toggle('active',active);option.setAttribute('aria-pressed',String(active));});
      const stock=button.dataset.stock===''?null:Number(button.dataset.stock);
      $('sizeSelectionHint').textContent=stock===null?'Selected size: '+displaySizeLabel(pendingSelectedSize):stock<1?'Selected size is out of stock.':'Selected size: '+displaySizeLabel(pendingSelectedSize)+' · '+stock+' in stock';
      $('confirmSizeButton').disabled=false;
    });
    async function confirmSizeSelection(){
      if(pendingSizeProductId===null||!pendingSelectedSize)return;
      const button=$('confirmSizeButton'),id=pendingSizeProductId,size=pendingSelectedSize,variantId=pendingSelectedVariantId;
      button.disabled=true;
      try{
        const product=products.find(item=>String(item.id)===String(id));
        if(!product){showToast('This product is no longer available.');closeSizeSelector();return;}
        if(Array.isArray(product.variants)){
          const variant=product.variants.find(item=>String(item.id)===String(variantId||''));
          if(!variant||Number(variant.stock)<1){renderSizeVariants(product);showToast('This size has no available stock now. Please select another size.');return;}
          const existing=cart.find(item=>String(item.id)===String(id)&&String(item.variantId||'')===String(variant.id));
          if((existing?Number(existing.qty)||0:0)+1>Number(variant.stock)){renderSizeVariants(product);showToast('Your cart already has the maximum available stock for this size.');return;}
        }
        closeSizeSelector();
        addToCart(id,size,variantId);
      }catch(error){console.error('GENMERCH could not verify stock before adding to cart.',error);showToast('Unable to verify live stock. Please try again.');}
      finally{if(isCenteredActionStatusLoading())hideCenteredActionStatus();if($('sizeOverlay').classList.contains('open'))button.disabled=true;}
    }
    $('confirmSizeButton').addEventListener('click',confirmSizeSelection);
    $('closeSizeModal').addEventListener('click',closeSizeSelector);
    $('cancelSizeButton').addEventListener('click',closeSizeSelector);
    $('sizeOverlay').addEventListener('click',event=>{if(event.target===$('sizeOverlay')){event.preventDefault();event.stopPropagation();}});

    function addToCart(id,size,variantId=null,requestedQty=1){
      const p=products.find(item=>String(item.id)===String(id));if(!p||!size)return false;
      const quantityToAdd=Math.max(1,Math.floor(Number(requestedQty)||1));
      let variant=null;
      if(Array.isArray(p.variants)){
        variant=p.variants.find(item=>String(item.id)===String(variantId||'')||(!variantId&&item.size===size));
        if(!variant||Number(variant.stock)<1){showToast('This size is currently out of stock.');return false;}
      }
      const chosenPrice=variant&&variant.price!==null?variant.price:p.price;
      const existing=cart.find(item=>String(item.id)===String(id)&&item.size===size&&String(item.variantId||'')===String(variant?variant.id:''));
      if(variant&&quantityToAdd>(Number(variant.stock)-(existing?existing.qty:0))){
        showToast('The requested quantity exceeds available stock.');
        return false;
      }
      if(existing){existing.qty+=quantityToAdd;existing.image=getProductImageForColor(p,variant?variant.color:'')||existing.image;}
      else cart.push({...p,image:getProductImageForColor(p,variant?variant.color:'')||p.image,variantId:variant?variant.id:null,variantSku:variant?variant.sku:'',availableStock:variant?variant.stock:null,color:variant?String(variant.color||''):'',size,price:chosenPrice,qty:quantityToAdd});
      updateCart();
      if(typeof window.playGenmerchNotificationChime==='function'){
        window.playGenmerchNotificationChime('cart:add:'+String(id)+':'+String(variant?variant.id||size:size)+':'+Date.now(),'cart');
      }
      showToast('Added to your cart successfully!',1500);
      return true;
    }
    async function changeQuantity(key,delta){
      const item=cart.find(product=>cartLineKey(product)===key);if(!item)return;
      if(delta>0&&Number.isFinite(item.availableStock)&&item.qty+delta>item.availableStock){
        showToast('Only '+item.availableStock+' unit(s) remain for this size.');
        return;
      }
      if(delta>0&&Number.isFinite(item.availableStock)&&item.qty>=item.availableStock){showToast('No more stock is available for this size.');return;}
      item.qty+=delta;
      if(item.qty<1)cart=cart.filter(product=>cartLineKey(product)!==key);
      updateCart();
    }
    function removeFromCart(key){
      cart=cart.filter(product=>cartLineKey(product)!==key);
      updateCart();showToast('Item removed from cart.');
    }

    // Region rates use the LOWEST amount supplied by the store as the default base estimate.
    // This is rule-based matching of the typed province/city, not GPS or courier API validation.
    const DELIVERY_BASE_RATES = {
      Luzon: { fee: 50, range: '₱50–₱80' },
      Visayas: { fee: 100, range: '₱100–₱150' },
      Mindanao: { fee: 120, range: '₱120–₱180+' }
    };

    // Use the address provider's official administrative parent metadata instead of a short manual list.
    // This lets every province supported by the source data map to the same store shipping zones.
    const ISLAND_ZONE_BY_REGION_ID = new Map([
      // Luzon and NCR/MIMAROPA
      ['NCR', 'Luzon'], ['CAR', 'Luzon'],
      ['R01', 'Luzon'], ['R1', 'Luzon'], ['R02', 'Luzon'], ['R2', 'Luzon'],
      ['R03', 'Luzon'], ['R3', 'Luzon'], ['R04A', 'Luzon'], ['R4A', 'Luzon'],
      ['R05', 'Luzon'], ['R5', 'Luzon'], ['R17', 'Luzon'], ['R4B', 'Luzon'],
      ['010000', 'Luzon'], ['020000', 'Luzon'], ['030000', 'Luzon'],
      ['040000', 'Luzon'], ['050000', 'Luzon'], ['130000', 'Luzon'], ['140000', 'Luzon'],
      ['170000', 'Luzon'],
      // Visayas, including the restored Negros Island Region where the source exposes it
      ['R06', 'Visayas'], ['R6', 'Visayas'], ['R07', 'Visayas'], ['R7', 'Visayas'],
      ['R08', 'Visayas'], ['R8', 'Visayas'], ['R18', 'Visayas'], ['NIR', 'Visayas'],
      ['060000', 'Visayas'], ['070000', 'Visayas'], ['080000', 'Visayas'], ['180000', 'Visayas'],
      // Mindanao and BARMM/legacy ARMM identifiers
      ['R09', 'Mindanao'], ['R9', 'Mindanao'], ['R10', 'Mindanao'], ['R11', 'Mindanao'],
      ['R12', 'Mindanao'], ['R13', 'Mindanao'], ['ARMM', 'Mindanao'], ['BARMM', 'Mindanao'],
      ['090000', 'Mindanao'], ['100000', 'Mindanao'], ['110000', 'Mindanao'],
      ['120000', 'Mindanao'], ['150000', 'Mindanao'], ['160000', 'Mindanao'], ['190000', 'Mindanao']
    ]);

    function normalizedRegionId(value) {
      return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function administrativeRegionDetails(record) {
      if (!record) return { id: '', name: '' };
      const ancestors = Array.isArray(record.ancestors) ? record.ancestors : [];
      const regionAncestor = ancestors.find(item => Number(item?.level) === 1) || ancestors[0] || null;
      const parent = record.parent || null;
      const name = record.region_name_en || record.region_name || record.parent_name_en ||
        record.parent_name_local || record.region?.name_en || record.region?.name?.en ||
        parent?.name_en || parent?.name?.en || parent?.name ||
        regionAncestor?.name_en || regionAncestor?.name?.en || regionAncestor?.name || '';
      const id = record.region_id || record.region_code || record.parent_region_id ||
        record.region?.id || parent?.id || regionAncestor?.id || record.parent_id || '';
      return { id: normalizedRegionId(id), name: String(name || '') };
    }

    function classifyAdministrativeRegionName(value) {
      const name = normalizeAddressText(value);
      if (!name) return null;

      // Names only come from the administrative-region field of a place record, not from an address string.
      if (name.includes('mimaropa') || name.includes('calabarzon') || name.includes('ilocos region') ||
          name.includes('cagayan valley') || name.includes('central luzon') || name.includes('bicol region') ||
          name.includes('cordillera') || name.includes('national capital region') || name === 'ncr' ||
          name === 'metro manila' || name.includes('region i (') || name.includes('region ii (') ||
          name.includes('region iii (') || name.includes('region iv a') || name.includes('region iv b') ||
          name.includes('region v (')) return 'Luzon';

      if (name.includes('negros island region') || name === 'nir' || name.includes('western visayas') ||
          name.includes('central visayas') || name.includes('eastern visayas') ||
          name.includes('region vi (') || name.includes('region vii (') || name.includes('region viii (')) return 'Visayas';

      if (name.includes('zamboanga peninsula') || name.includes('northern mindanao') ||
          name.includes('davao region') || name.includes('soccsksargen') || name.includes('caraga') ||
          name.includes('muslim mindanao') || name.includes('bangsamoro') || name === 'armm' || name === 'barmm' ||
          name.includes('region ix (') || name.includes('region x (') || name.includes('region xi (') ||
          name.includes('region xii (') || name.includes('region xiii (')) return 'Mindanao';

      // Fallback for source records whose region text is only the numbered region label.
      if (/^region (i|1)$/.test(name) || /^region (ii|2)$/.test(name) || /^region (iii|3)$/.test(name) ||
          /^region (iv-a|4-a)$/.test(name) || /^region (iv-b|4-b)$/.test(name) || /^region (v|5)$/.test(name)) return 'Luzon';
      if (/^region (vi|6)$/.test(name) || /^region (vii|7)$/.test(name) || /^region (viii|8)$/.test(name) ||
          /^region (xviii|18)$/.test(name)) return 'Visayas';
      if (/^region (ix|9)$/.test(name) || /^region (x|10)$/.test(name) || /^region (xi|11)$/.test(name) ||
          /^region (xii|12)$/.test(name) || /^region (xiii|13)$/.test(name)) return 'Mindanao';
      return null;
    }

    function classifyRegionRecord(record) {
      const details = administrativeRegionDetails(record);
      const byId = ISLAND_ZONE_BY_REGION_ID.get(details.id);
      if (byId) return { region: byId, administrativeRegion: details.name };
      const byName = classifyAdministrativeRegionName(details.name);
      if (byName) return { region: byName, administrativeRegion: details.name };
      return null;
    }

    function findExactProvinceRecord(value) {
      const needle = normalizeAddressText(value);
      if (!needle) return null;
      if (selectedProvinceRecord && normalizeAddressText(placeName(selectedProvinceRecord)) === needle) {
        return selectedProvinceRecord;
      }
      return cachedProvinceRecords.find(record => normalizeAddressText(placeName(record)) === needle) || null;
    }

    function findExactCityRecord(value, provinceRecord = null) {
      const needle = normalizeAddressText(value);
      if (!needle) return null;
      if (selectedCityRecord && normalizeAddressText(placeName(selectedCityRecord)) === needle) {
        const selectedParent = String(selectedCityRecord.parent_id || '');
        if (!provinceRecord || selectedParent === String(provinceRecord.id || '') ||
            normalizeAddressText(placeParentName(selectedCityRecord)) === normalizeAddressText(placeName(provinceRecord))) {
          return selectedCityRecord;
        }
      }
      const matches = cachedMunicipalityRecords.filter(record => normalizeAddressText(placeName(record)) === needle);
      if (provinceRecord) {
        const sameProvince = matches.find(record => String(record.parent_id || '') === String(provinceRecord.id || '') ||
          normalizeAddressText(placeParentName(record)) === normalizeAddressText(placeName(provinceRecord)));
        if (sameProvince) return sameProvince;
      }
      return matches.length === 1 ? matches[0] : null;
    }

    function resolveProvinceForCurrentAddress() {
      const typedProvince = $('province').value.trim();
      const provinceRecord = findExactProvinceRecord(typedProvince);
      if (provinceRecord) return provinceRecord;

      // If City/Municipality was chosen first, resolve its parent province from the same dataset.
      const cityRecord = findExactCityRecord($('city').value.trim());
      if (cityRecord) {
        const byId = cachedProvinceRecords.find(record => String(record.id || '') === String(cityRecord.parent_id || ''));
        if (byId) return byId;
        const parentName = normalizeAddressText(placeParentName(cityRecord));
        const byName = cachedProvinceRecords.find(record => normalizeAddressText(placeName(record)) === parentName);
        if (byName) return byName;
      }
      return null;
    }

    function getDeliveryDestination() {
      const city = $('city').value.trim();
      const province = $('province').value.trim();
      if (city && province) return `${city}, ${province}`;
      return province || city || '';
    }

    function detectDeliveryRegion() {
      const provinceRecord = resolveProvinceForCurrentAddress();
      if (!provinceRecord) return null;

      const classified = classifyRegionRecord(provinceRecord);
      if (!classified) return null;

      const destination = getDeliveryDestination();
      const city = $('city').value.trim();
      const cityRecord = city ? findExactCityRecord(city, provinceRecord) : null;
      // Do not estimate from stale city/province selections if the hierarchy contradicts itself.
      if (city && cityRecord && String(cityRecord.parent_id || '') !== String(provinceRecord.id || '') &&
          normalizeAddressText(placeParentName(cityRecord)) !== normalizeAddressText(placeName(provinceRecord))) {
        return null;
      }

      return {
        region: classified.region,
        fee: DELIVERY_BASE_RATES[classified.region].fee,
        range: DELIVERY_BASE_RATES[classified.region].range,
        destination,
        adminRegion: classified.administrativeRegion || ''
      };
    }

    let checkoutCurrentStep='order';
    let checkoutReceiptEmailTouched=false;
    function syncCheckoutReceiptEmailDefault(){
      const input=$('receiptEmail');
      if(!input||checkoutReceiptEmailTouched)return;
      const signedInEmail=customerAuthCurrentSession&&customerAuthCurrentSession.user
        ?String(customerAuthCurrentSession.user.email||'').trim().toLowerCase():'';
      input.value=signedInEmail;
      $('receiptEmailHint').textContent=signedInEmail
        ?'Pre-filled with your GENMERCH sign-in email. You can change it to another address for this order.'
        :'Sign in to use your GENMERCH email automatically, or enter the email address where you want to receive the order details.';
    }
    function setCheckoutStep(step){
      checkoutCurrentStep=step==='delivery'?'delivery':step==='review'?'review':'order';
      const orderStep=checkoutCurrentStep==='order';
      const deliveryStep=checkoutCurrentStep==='delivery';
      const reviewStep=checkoutCurrentStep==='review';
      $('checkoutStepOrder').hidden=!orderStep;
      $('checkoutStepDelivery').hidden=orderStep;
      $('checkoutAddressStep').hidden=!deliveryStep;
      $('checkoutStepReview').hidden=!reviewStep;
      const stepNumber=orderStep?1:deliveryStep?2:3;
      $('cartTitleText').textContent='Checkout ('+stepNumber+'/3)';
      $('drawerCountWrap').hidden=true;
      $('checkoutStepIndicator').textContent='STEP '+stepNumber+' OF 3';

      $('checkoutProgressOrder').classList.toggle('active',orderStep);
      $('checkoutProgressOrder').classList.toggle('complete',!orderStep);
      $('checkoutProgressDelivery').classList.toggle('active',deliveryStep);
      $('checkoutProgressDelivery').classList.toggle('complete',reviewStep);
      $('checkoutProgressReview').classList.toggle('active',reviewStep);
      $('checkoutProgressConnector').classList.toggle('active',!orderStep);
      $('checkoutProgressConnectorTwo').classList.toggle('active',reviewStep);

      ['checkoutProgressOrder','checkoutProgressDelivery','checkoutProgressReview'].forEach(id=>$(id).removeAttribute('aria-current'));
      $(orderStep?'checkoutProgressOrder':deliveryStep?'checkoutProgressDelivery':'checkoutProgressReview').setAttribute('aria-current','step');

      $('checkoutContinueButton').disabled=!cart.length;
      if(deliveryStep){
        $('checkoutDeliveryScroll').scrollTop=0;
      }else if(reviewStep){
        syncCheckoutReceiptEmailDefault();
        $('checkoutReviewScroll').scrollTop=0;
        if(typeof window.genmerchRefreshLoyaltyPoints==='function'){
          Promise.resolve(window.genmerchRefreshLoyaltyPoints()).catch(error=>console.warn('GENMERCH loyalty balance refresh failed before order review.',error));
        }
      }else{
        $('checkoutOrderScroll').scrollTop=0;
      }
    }
    function validateCheckoutAddressBeforeReview(){
      syncCheckoutFullName();
      let valid=true;
      let firstInvalid=null;
      requiredFields.filter(field=>field.id!=='receiptEmail').forEach(field=>{
        const input=$(field.id);
        const error=$(field.error);
        const value=String(input&&input.value||'').trim();
        const fieldValid=Boolean(input)&&Boolean(field.valid(value));
        if(error)error.classList.toggle('show',!fieldValid);
        if(input)input.setAttribute('aria-invalid',String(!fieldValid));
        if(!fieldValid){
          valid=false;
          if(!firstInvalid&&input)firstInvalid=input;
        }
      });
      if(!valid){
        checkoutFeedback('Please complete your delivery address before continuing to order review.','error');
        if(firstInvalid)firstInvalid.focus({preventScroll:false});
        return false;
      }
      checkoutFeedback('');
      return true;
    }
    $('checkoutContinueButton').addEventListener('click',()=>{
      if(!cart.length){showToast('Your cart is empty. Add a product before continuing.');return;}
      setCheckoutStep('delivery');
    });
    $('checkoutDeliveryContinueButton').addEventListener('click',()=>{
      if(!validateCheckoutAddressBeforeReview())return;
      updateCart();
      setCheckoutStep('review');
    });
    $('checkoutEditOrderButton').addEventListener('click',()=>setCheckoutStep('delivery'));
    $('checkoutBackFooterButton').addEventListener('click',()=>setCheckoutStep('order'));
    $('checkoutReviewBackButton').addEventListener('click',()=>setCheckoutStep('delivery'));

    function updateCart(){
      const count=cart.reduce((sum,item)=>sum+item.qty,0);
      $('cartBadge').textContent=count;$('drawerCount').textContent=count;
      $('checkoutContinueButton').disabled=!cart.length;
      if(!cart.length){$('cartItemsContainer').innerHTML='<p class="cart-empty">Your cart is empty.</p>';}
      else{
        $('cartItemsContainer').innerHTML=cart.map(item=>{
          const liveProduct=products.find(product=>String(product.id)===String(item.id));
          const liveVariant=liveProduct&&Array.isArray(liveProduct.variants)?liveProduct.variants.find(variant=>String(variant.id)===String(item.variantId||'')):null;
          const currentStock=liveProduct&&Array.isArray(liveProduct.variants)?(liveVariant?Number(liveVariant.stock)||0:0):item.availableStock;
          const photoUrl=safeCatalogImageUrl((liveProduct&&getProductImageForColor(liveProduct,item.color))||item.image||(liveProduct&&liveProduct.image));
          const photoMarkup=photoUrl?'<img class="cart-product-photo" src="'+escapeHtml(photoUrl)+'" alt="'+escapeHtml(item.name)+'" loading="lazy" decoding="async">':escapeHtml(item.icon||'🛍️');
          const stockMarkup=Number.isFinite(currentStock)?(currentStock>0?'<div class="item-stock">'+currentStock+' available</div>':'<div class="item-stock unavailable">Currently unavailable — remove this item or choose another size.</div>'):'';
          const plusDisabled=Number.isFinite(currentStock)&&(currentStock<1||item.qty>=currentStock);
          return `
          <div class="cart-item"><div class="item-icon">${photoMarkup}</div><div><div class="item-name">${escapeHtml(item.name)}</div>${item.color?'<div class="item-size">Color: '+escapeHtml(item.color)+'</div>':''}<div class="item-size">Size: ${escapeHtml(displaySizeLabel(item.size))}</div>${stockMarkup}<div class="item-price">${money(item.price*item.qty)}</div><div class="qty-row"><button class="qty-btn" data-qty="-1" data-cart-key="${escapeHtml(cartLineKey(item))}" aria-label="Decrease quantity for ${escapeHtml(item.name)}, ${escapeHtml(item.size)}">−</button><span class="qty-number">${item.qty}</span><button class="qty-btn" data-qty="1" data-cart-key="${escapeHtml(cartLineKey(item))}" aria-label="Increase quantity for ${escapeHtml(item.name)}, ${escapeHtml(item.size)}" ${plusDisabled?'disabled':''}>+</button></div></div><button class="remove-btn" data-remove-key="${escapeHtml(cartLineKey(item))}" aria-label="Remove ${escapeHtml(item.name)}, ${escapeHtml(item.size)}"><svg class="remove-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.2 6.4 9.05 3.8A1.9 1.9 0 0 1 10.85 2.5h2.3a1.9 1.9 0 0 1 1.8 1.3l.85 2.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.1 6.1h17.8v.45a1.7 1.7 0 0 1-1.7 1.7H4.8a1.7 1.7 0 0 1-1.7-1.7V6.1Z" fill="currentColor"/><path d="M4.8 9.1h14.4l-1.25 11.1a2.1 2.1 0 0 1-2.08 1.86H8.13a2.1 2.1 0 0 1-2.08-1.86L4.8 9.1Z" fill="currentColor"/><path d="M9 11.4v7.8M12 11.4v7.8M15 11.4v7.8" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round"/></svg></button></div>`;
        }).join('');
      }
      const subtotal=cart.reduce((sum,item)=>sum+item.price*item.qty,0);
      const delivery=detectDeliveryRegion();
      $('summaryBox').style.display=cart.length?'grid':'none';
      $('subtotalText').textContent=money(subtotal);

      if (!cart.length) {
        $('shippingText').textContent=money(0);
        $('finalTotalText').textContent=money(0);
        $('shippingEstimate').textContent='Add an item to your cart, then enter your city/municipality and province to estimate delivery.';
      } else if (delivery) {
        const zoneLabel = delivery.adminRegion
          ? `${delivery.region} · ${delivery.adminRegion}`
          : delivery.region;
        $('shippingText').textContent=`${money(delivery.fee)} (${zoneLabel})`;
        $('finalTotalText').textContent=money(subtotal+delivery.fee);
        const destinationLabel = delivery.destination
          ? `<strong>Destination matched:</strong> ${escapeHtml(delivery.destination)}. `
          : '';
        $('shippingEstimate').innerHTML=`${destinationLabel}<strong>Shipping zone: ${zoneLabel}.</strong> Default base delivery fee: <strong>${money(delivery.fee)}</strong> for a lightweight parcel up to 0.5 kg. Standard rate range: ${delivery.range}.`;
      } else {
        $('shippingText').textContent='Awaiting address';
        $('finalTotalText').textContent='Complete address';
        $('shippingEstimate').textContent='Choose a city/municipality and province from the suggestions. The matched destination and shipping zone will appear here automatically.';
      }
      $('checkoutReviewSubtotal').textContent=money(subtotal);
      $('checkoutReviewShipping').textContent=!cart.length?money(0):(delivery?money(delivery.fee):'Awaiting address');
      $('checkoutMiniTotal').textContent=$('finalTotalText').textContent.trim()||'—';
      $('checkoutReviewItems').innerHTML=cart.length?cart.map(item=>{
        const liveProduct=products.find(product=>String(product.id)===String(item.id));
        const photoUrl=safeCatalogImageUrl((liveProduct&&getProductImageForColor(liveProduct,item.color))||item.image||(liveProduct&&liveProduct.image));
        const photoMarkup=photoUrl
          ?'<img src="'+escapeHtml(photoUrl)+'" alt="'+escapeHtml(item.name)+'" loading="lazy" decoding="async">'
          :'<span class="checkout-review-item-icon">'+escapeHtml(item.icon||'🛍️')+'</span>';
        const details=[item.color?'Color: '+escapeHtml(item.color):'', 'Size: '+escapeHtml(displaySizeLabel(item.size)), 'Qty: '+Math.max(1,Math.floor(Number(item.qty)||1))].filter(Boolean).join(' · ');
        return '<div class="checkout-review-item"><div class="checkout-review-thumb">'+photoMarkup+'</div><div class="checkout-review-item-details"><strong>'+escapeHtml(item.name)+'</strong><small>'+details+'</small></div><strong class="checkout-review-item-cost">'+money(item.price*item.qty)+'</strong></div>';
      }).join(''):'<p class="checkout-review-empty">Your cart is empty. Go back to order details to add products.</p>';
      saveDraftState();
    }
    $('cartItemsContainer').addEventListener('click',event=>{
      const qty=event.target.closest('[data-qty]');
      if(qty){changeQuantity(qty.dataset.cartKey,Number(qty.dataset.qty));return;}
      const remove=event.target.closest('[data-remove-key]');
      if(remove)removeFromCart(remove.dataset.removeKey);
    });

    function openCart(){
      setCheckoutStep('order');
      $('cartOverlay').classList.add('open');$('cartModal').classList.add('open');
      $('cartModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    }
    function closeCart(){
      $('cartOverlay').classList.remove('open');$('cartModal').classList.remove('open');
      $('cartModal').setAttribute('aria-hidden','true');document.body.style.overflow='';
    }
    $('openCartButton').addEventListener('click',openCart);
    $('closeCartButton').addEventListener('click',closeCart);
    $('cartOverlay').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSizeSelector();closeCart();closeProduct();closeNotice();closeWishlist();closeCustomerOrders();}});

    document.querySelectorAll('[data-payment]').forEach(button=>button.addEventListener('click',()=>{
      selectedPayment=button.dataset.payment;
      document.querySelectorAll('[data-payment]').forEach(item=>{
        const isSelected=item===button;
        item.classList.toggle('active',isSelected);
        item.setAttribute('aria-pressed',String(isSelected));
      });
      saveDraftState();
    }));
    $('clearSavedDraftButton').addEventListener('click',clearSavedDraft);

    const checkoutEmailIsValid=value=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value||'').trim());
    const requiredFields=[
      {id:'firstName',error:'firstNameError',valid:isValidCheckoutNamePart},
      {id:'lastName',error:'lastNameError',valid:isValidCheckoutNamePart},
      {id:'custPhone',error:'phoneError',valid:value=>/^09\d{9}$/.test(value)},
      {id:'streetAddress',error:'streetError',valid:value=>value.length>2},
      {id:'landmark',error:'landmarkError',valid:value=>value.length>0},
      {id:'specialInstructions',error:'specialInstructionsError',valid:value=>value.length>0},
      {id:'province',error:'provinceError',valid:value=>value.length>0},
      {id:'city',error:'cityError',valid:value=>value.length>0},
      {id:'barangay',error:'barangayError',valid:value=>value.length>0},
      {id:'postalCode',error:'postalError',valid:value=>/^\d{4}$/.test(value)},
      {id:'receiptEmail',error:'receiptEmailError',valid:checkoutEmailIsValid}
    ];
    // Capture-phase guard: block the submit event before any order handler can run.
    // This is deliberately independent of the later submit handler as a fail-closed safeguard.
    function guardCheckoutSubmit(event){
      // The order may only be submitted from the final review step.
      // This also blocks implicit Enter-key submission from the address step.
      if(checkoutCurrentStep!=='review'){
        event.preventDefault();
        event.stopImmediatePropagation();
        return false;
      }
      checkoutValidationAttempted=true;
      syncCheckoutFullName();
      let valid=true;
      let firstInvalid=null;
      requiredFields.forEach(field=>{
        const input=$(field.id);
        const error=$(field.error);
        const value=String(input&&input.value||'').trim();
        const fieldValid=Boolean(input)&&Boolean(field.valid(value));
        if(error)error.classList.toggle('show',!fieldValid);
        if(input)input.setAttribute('aria-invalid',String(!fieldValid));
        if(!fieldValid){
          valid=false;
          if(!firstInvalid&&input)firstInvalid=input;
        }
      });
      if(!valid){
        event.preventDefault();
        event.stopImmediatePropagation();
        checkoutFeedback('Please complete all required fields. Check the red messages under each field before placing your order.','error');
        if(firstInvalid)firstInvalid.focus({preventScroll:false});
        return false;
      }
      return true;
    }
    $('checkoutForm').addEventListener('submit',guardCheckoutSubmit,true);

    ['firstName','lastName'].forEach(id=>{
      $(id).addEventListener('input',syncCheckoutFullName);
      $(id).addEventListener('change',syncCheckoutFullName);
    });
    function updateCheckoutFieldError(field,forceShow=false){
      const input=$(field.id),value=String(input.value||'').trim(),valid=field.valid(value);
      const shouldShow=forceShow||checkoutValidationAttempted||Boolean(value);
      $(field.error).classList.toggle('show',shouldShow&&!valid);
      input.setAttribute('aria-invalid',String(shouldShow&&!valid));
      return valid;
    }
    requiredFields.forEach(field=>{
      $(field.id).addEventListener('input',()=>{
        if(field.id==='firstName'||field.id==='lastName')syncCheckoutFullName();
        updateCheckoutFieldError(field);
        if(checkoutValidationAttempted&&requiredFields.every(item=>item.valid(String($(item.id).value||'').trim())))checkoutFeedback('');
      });
      $(field.id).addEventListener('blur',()=>updateCheckoutFieldError(field));
    });
    $('receiptEmail').addEventListener('input',()=>{
      checkoutReceiptEmailTouched=true;
      const receiptField=requiredFields.find(field=>field.id==='receiptEmail');
      if(receiptField)updateCheckoutFieldError(receiptField);
    });

    // Autosave all delivery fields on input/change; refresh delivery estimate on location fields.
    GENMERCH_DRAFT_FIELD_IDS.forEach(id=>{
      const field=$(id);
      field.addEventListener('input',saveDraftState);
      field.addEventListener('change',saveDraftState);
    });
    ['streetAddress','barangay','city','province','postalCode','landmark'].forEach(id=>{
      $(id).addEventListener('input',updateCart);
      $(id).addEventListener('change',updateCart);
    });


    const GENMERCH_CHECKOUT_AUTH_DRAFT_KEY='genmerch.checkoutAuthDraft.v1';
    let checkoutAuthResumeInFlight=false;
    function setCheckoutAccountGateMessage(message){const node=$('checkoutAccountGateMessage');if(!node)return;node.textContent=message||'';node.hidden=!message;}
    function openCheckoutAccountGate(message=''){const overlay=$('checkoutAccountGateOverlay');if(!overlay)return;overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');setCheckoutAccountGateMessage(message);document.body.style.overflow='hidden';window.setTimeout(()=>{const first=$('checkoutAccountGateGoogle');if(first&&overlay.classList.contains('open'))first.focus({preventScroll:true});},0);}
    function closeCheckoutAccountGate(clearPending=false){const overlay=$('checkoutAccountGateOverlay');if(overlay){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');}if(clearPending){try{sessionStorage.removeItem(GENMERCH_CHECKOUT_AUTH_DRAFT_KEY);}catch(_){}}if(($('cartModal')&&$('cartModal').classList.contains('open'))||($('customerAuthOverlay')&&$('customerAuthOverlay').classList.contains('open')))document.body.style.overflow='hidden';else document.body.style.overflow='';}
    function capturePendingCheckoutAuthDraft(){
      try{
        if(typeof saveDraftState==='function')saveDraftState();
        const snapshot={version:1,createdAt:Date.now(),draft:buildDraftSnapshot(),receiptEmail:String($('receiptEmail')&&$('receiptEmail').value||''),cartFallback:cart.slice(0,100).map(item=>({id:String(item.id||''),variantId:String(item.variantId||''),variantSku:String(item.variantSku||''),size:String(item.size||''),qty:Math.max(1,Math.min(999,Math.floor(Number(item.qty)||1))),name:String(item.name||''),price:Number(item.price)||0,image:String(item.image||''),cat:String(item.cat||''),color:String(item.color||''),off:String(item.off||''),availableStock:Math.max(0,Number(item.availableStock)||0)}))};
        sessionStorage.setItem(GENMERCH_CHECKOUT_AUTH_DRAFT_KEY,JSON.stringify(snapshot));return true;
      }catch(error){console.warn('GENMERCH could not preserve the pending checkout across sign-in.',error);setCheckoutAccountGateMessage('Your checkout is still open, but this browser could not save a temporary sign-in draft. Allow session storage, then try again so your details can be restored safely.');return false;}
    }
    function readPendingCheckoutAuthDraft(){try{const raw=sessionStorage.getItem(GENMERCH_CHECKOUT_AUTH_DRAFT_KEY);if(!raw)return null;const snapshot=JSON.parse(raw),age=Date.now()-Number(snapshot&&snapshot.createdAt||0);if(!snapshot||snapshot.version!==1||!snapshot.draft||snapshot.draft.schemaVersion!==1||!Number.isFinite(age)||age< -60000||age>60*60*1000){sessionStorage.removeItem(GENMERCH_CHECKOUT_AUTH_DRAFT_KEY);return null;}return snapshot;}catch(_){return null;}}
    function restorePendingCheckoutCart(snapshot){
      const saved=Array.isArray(snapshot&&snapshot.cartFallback)?snapshot.cartFallback:[];if(!saved.length)return;
      cart=saved.filter(item=>item&&item.id).map(entry=>{const product=products.find(item=>String(item.id)===String(entry.id))||(catalogLoadState!=='connected'?LOCAL_DEMO_PRODUCTS.find(item=>String(item.id)===String(entry.id)):null);const variant=product&&Array.isArray(product.variants)?product.variants.find(item=>String(item.id)===String(entry.variantId||'')):null;const price=variant&&variant.price!=null?variant.price:(entry.price!=null?entry.price:(product&&product.price)||0);return {...(product||{}),...entry,id:String(entry.id),variantId:String(entry.variantId||''),variantSku:(variant&&variant.sku)||entry.variantSku||'',name:(product&&product.name)||entry.name||'GENMERCH item',price:Number(price)||0,image:entry.image||(product&&product.image)||'',size:String(entry.size||''),qty:Math.max(1,Math.min(999,Math.floor(Number(entry.qty)||1))),availableStock:variant?Math.max(0,Number(variant.stock)||0):Math.max(0,Number(entry.availableStock)||0)};});
    }
    async function resumePendingCheckoutAfterAuth(session,pendingSnapshot){
      const snapshot=pendingSnapshot||readPendingCheckoutAuthDraft();if(!session||!session.user||!snapshot)return false;
      try{try{await refreshCatalogForLiveStock();}catch(error){console.warn('GENMERCH catalogue refresh during checkout restoration failed.',error);}restoreDraftState(JSON.stringify(snapshot.draft));restorePendingCheckoutCart(snapshot);try{await restoreAddressReferenceContext();}catch(error){console.warn('GENMERCH address restoration during checkout sign-in failed.',error);}updateCart();closeCheckoutAccountGate(false);closeCustomerAuth();openCart();setCheckoutStep('delivery');if($('receiptEmail'))$('receiptEmail').value=String(snapshot.receiptEmail||'');checkoutReceiptEmailTouched=Boolean(snapshot.receiptEmail);saveDraftState();try{sessionStorage.removeItem(GENMERCH_CHECKOUT_AUTH_DRAFT_KEY);}catch(_){}showToast('Your checkout details are restored. You can place your order now.');return true;}
      catch(error){console.error('GENMERCH could not restore the pending checkout after sign-in.',error);openCheckoutAccountGate('You are signed in, but we could not reopen checkout automatically. Your cart and saved details have been kept—close this message and open your cart to continue.');return false;}
    }
    function openCustomerAuthFromCheckout(mode='signin',google=false){const saved=capturePendingCheckoutAuthDraft();if(google&&!saved)return;closeCheckoutAccountGate(false);openCustomerAuth();setCustomerAuthMode(mode==='signup'?'signup':'signin');if(google)window.setTimeout(()=>{const button=$('customerGoogleButton');if(button)button.click();},40);}
    $('checkoutAccountGateClose').addEventListener('click',()=>closeCheckoutAccountGate(true));$('checkoutAccountGateLater').addEventListener('click',()=>closeCheckoutAccountGate(true));$('checkoutAccountGateOverlay').addEventListener('click',event=>{if(event.target===$('checkoutAccountGateOverlay')){event.preventDefault();event.stopPropagation();}});
    $('checkoutAccountGateGoogle').addEventListener('click',()=>openCustomerAuthFromCheckout('signin',true));$('checkoutAccountGateCreate').addEventListener('click',()=>openCustomerAuthFromCheckout('signup',false));$('checkoutAccountGateSignIn').addEventListener('click',()=>openCustomerAuthFromCheckout('signin',false));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('checkoutAccountGateOverlay').classList.contains('open'))closeCheckoutAccountGate(true);});

    const GENMERCH_PENDING_CHECKOUT_KEY='genmerch.pendingCheckout.v1';
    let checkoutSubmitting=false;
    function checkoutFeedback(message,type=''){
      const node=$('checkoutSubmitFeedback');
      if(!node)return;
      node.textContent=message||'';
      node.className='checkout-submit-feedback'+(type?' '+type:'');
      node.hidden=!message;
    }
    function checkoutRequestIdForPayload(payload){
      const signature=JSON.stringify(payload);
      try{
        const old=JSON.parse(sessionStorage.getItem(GENMERCH_PENDING_CHECKOUT_KEY)||'null');
        if(old&&old.signature===signature&&old.id)return old.id;
      }catch(_){}
      const id=(window.crypto&&typeof window.crypto.randomUUID==='function')
        ?window.crypto.randomUUID()
        :'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return (ch==='x'?r:(r&3|8)).toString(16);});
      try{sessionStorage.setItem(GENMERCH_PENDING_CHECKOUT_KEY,JSON.stringify({signature,id}));}catch(_){}
      return id;
    }
    async function submitLiveGenmerchOrder(){
      if(checkoutSubmitting)return;
      if(!cart.length){checkoutFeedback('Your cart is empty. Add a product before placing an order.','error');return;}
      // Verify the live Supabase session before validating or submitting customer details.
      let verifiedSession=null;
      try{const authClient=getCustomerAuthClient();const sessionResult=await authClient.auth.getSession();if(sessionResult.error)throw sessionResult.error;verifiedSession=sessionResult.data&&sessionResult.data.session?sessionResult.data.session:null;}
      catch(error){capturePendingCheckoutAuthDraft();openCheckoutAccountGate('We could not verify your sign-in session. Please sign in or create an account before placing your order.');return;}
      if(!verifiedSession||!verifiedSession.user){capturePendingCheckoutAuthDraft();openCheckoutAccountGate();return;}
      customerAuthCurrentSession=verifiedSession;updateCustomerAuthScreen(verifiedSession);
      checkoutValidationAttempted=true;
      syncCheckoutFullName();
      let valid=true,firstInvalid=null;
      requiredFields.forEach(field=>{
        const input=$(field.id),fieldValid=field.valid(String(input.value||'').trim());
        $(field.error).classList.toggle('show',!fieldValid);
        input.setAttribute('aria-invalid',String(!fieldValid));
        if(!fieldValid){valid=false;if(!firstInvalid)firstInvalid=input;}
      });
      if(!valid){
        checkoutFeedback('Please complete all required fields. Check the red messages under each field before placing your order.','error');
        firstInvalid?.focus({preventScroll:false});
        return;
      }
      checkoutFeedback('');
      const delivery=detectDeliveryRegion();
      if(!delivery){
        checkoutFeedback('We could not confirm the delivery zone. Please select your province and city again from the address suggestions.','error');
        $('province').focus();return;
      }
      const lines=cart.map(item=>({
        product_id:String(item.id||''),
        variant_id:String(item.variantId||''),
        quantity:Math.max(1,Math.floor(Number(item.qty)||1))
      }));
      if(lines.some(item=>!item.product_id||!item.variant_id)){
        checkoutFeedback('One or more cart items have no valid size variant. Remove the item, refresh the catalog, and add it again.','error');
        return;
      }
      const requestPayload={
        customer_name:syncCheckoutFullName(),
        customer_phone:$('custPhone').value.trim(),
        customer_email:(customerAuthCurrentSession&&customerAuthCurrentSession.user&&customerAuthCurrentSession.user.email)||null,
        receipt_email:$('receiptEmail').value.trim().toLowerCase(),
        shipping_street_address:$('streetAddress').value.trim(),
        shipping_barangay:$('barangay').value.trim(),
        shipping_city_municipality:$('city').value.trim(),
        shipping_province:$('province').value.trim(),
        shipping_postal_code:$('postalCode').value.trim(),
        shipping_landmark:$('landmark').value.trim(),
        delivery_instructions:$('specialInstructions').value.trim(),
        payment_method:selectedPayment,
        loyalty_points_to_redeem:(window.genmerchSelectedLoyaltyPoints||0),
        items:lines
      };
      const button=$('checkoutForm').querySelector('button[type="submit"]');
      showCenteredActionStatus('Placing your order, please wait...','loading');
      checkoutSubmitting=true;
      if(button){button.disabled=true;button.textContent='Submitting order…';}
      checkoutFeedback('Checking current prices and stock, then submitting your order securely…');
      try{
        // The order RPC performs authoritative price/stock checks and row locks in one database transaction.
        const client=getCustomerAuthClient();
        const requestId=checkoutRequestIdForPayload(requestPayload);
        const result=await client.rpc('create_genmerch_order',{
          p_checkout_request_id:requestId,
          p_customer_name:requestPayload.customer_name,
          p_customer_phone:requestPayload.customer_phone,
          p_customer_email:requestPayload.customer_email,
          p_receipt_email:requestPayload.receipt_email,
          p_shipping_street_address:requestPayload.shipping_street_address,
          p_shipping_barangay:requestPayload.shipping_barangay,
          p_shipping_city_municipality:requestPayload.shipping_city_municipality,
          p_shipping_province:requestPayload.shipping_province,
          p_shipping_postal_code:requestPayload.shipping_postal_code,
          p_shipping_landmark:requestPayload.shipping_landmark,
          p_delivery_instructions:requestPayload.delivery_instructions,
          p_payment_method:requestPayload.payment_method,
          p_items:requestPayload.items,
          p_loyalty_points_to_redeem:requestPayload.loyalty_points_to_redeem||0
        });
        if(result.error)throw result.error;
        const order=Array.isArray(result.data)?result.data[0]:result.data;
        if(!order||!order.order_number||!order.order_id)throw new Error('Supabase did not return a confirmed order number. Your cart has been kept. Please check Seller Centre or retry using the same checkout details.'); try{ if(typeof window.genmerchSaveUsedCheckoutAddress==='function'){ await window.genmerchSaveUsedCheckoutAddress(requestPayload); } }catch(addressSaveError){ console.warn('Order placed, but address-book auto-save did not finish.',addressSaveError); } window.dispatchEvent(new Event('genmerch:loyalty-updated'));
        let receiptEmailResult={ok:false,recipient_email:requestPayload.receipt_email,message:'Automatic email confirmation could not be sent right now.'};
        try{
          const emailResponse=await client.functions.invoke('send-genmerch-order-confirmation',{
            body:{
              order_id:order.order_id,
              order_number:order.order_number,
              customer_phone:requestPayload.customer_phone,
              recipient_email:requestPayload.receipt_email
            }
          });
          if(emailResponse.error)throw emailResponse.error;
          const emailData=emailResponse.data||{};
          if(!emailData.ok)throw new Error(emailData.message||'The email provider did not confirm sending the order email.');
          receiptEmailResult={ok:true,recipient_email:emailData.recipient_email||requestPayload.receipt_email,already_sent:Boolean(emailData.already_sent)};
        }catch(emailError){
          console.warn('GENMERCH order was saved, but the confirmation email was not sent.',emailError);
          receiptEmailResult={ok:false,recipient_email:requestPayload.receipt_email,message:emailError&&emailError.message?emailError.message:'Automatic email confirmation could not be sent right now.'};
        }
        Promise.all([...new Set(lines.map(line=>line.product_id))].map(refreshProductVariantsInBackground))
          .then(()=>{renderProducts();})
          .catch(stockRefreshError=>console.warn('The order is saved; product stock will refresh on the next view.',stockRefreshError));
        try{sessionStorage.removeItem(GENMERCH_PENDING_CHECKOUT_KEY);}catch(_){}
        checkoutFeedback('');
        resetDraftInMemory();
        try{localStorage.removeItem(GENMERCH_DRAFT_STORAGE_KEY);draftStorageAvailable=true;}catch(_){}
        updateCart();
        closeCart();
        const isCod=order.payment_method==='COD';
        const paymentNote=isCod
          ?'<p><strong>Payment:</strong> Cash on Delivery. Payment status is pending until payment is received.</p>'
          :'<p><strong>Payment:</strong> '+escapeHtml(order.payment_method||'Selected method')+' recorded as your preference. Payment status is pending. No GCash/Maya/bank transfer was processed automatically; the seller will coordinate payment instructions.</p>';
        const emailConfirmationNote=receiptEmailResult.ok
          ?'<div class="order-email-result order-email-result-sent"><strong>✉️ Order details emailed</strong><p>We sent your order details to <strong>'+escapeHtml(receiptEmailResult.recipient_email)+'</strong>. Check your inbox and spam/junk folder for your GENMERCH - Suot Apparel email.</p><p>Please take a screenshot of this order confirmation too, and keep your order number for reference.</p></div>'
          :'<div class="order-email-result order-email-result-pending"><strong>📸 Please save this order confirmation</strong><p>Your order was placed successfully, but the email confirmation could not be sent automatically right now. Please take a screenshot of this screen and keep your order number.</p><p>Requested recipient email: <strong>'+escapeHtml(receiptEmailResult.recipient_email||requestPayload.receipt_email)+'</strong>. Once email delivery is available, check that inbox for your order details.</p></div>';
        const message='<p>Your order has been saved to GENMERCH and the seller can now see it in Seller Centre.</p>'+
          '<div class="order-success-number"><span>Order number</span><strong>'+escapeHtml(order.order_number)+'</strong></div>'+
          '<p><strong>Items subtotal:</strong> '+money(order.subtotal)+'</p>'+
          '<p><strong>Delivery fee:</strong> '+money(order.shipping_fee)+' ('+escapeHtml(order.delivery_zone||delivery.region)+')</p>'+
          '<p class="order-success-total"><strong>Total order amount:</strong> '+money(order.total_amount)+'</p>'+
          paymentNote+
          emailConfirmationNote+
          '<p>Stock has been reserved for this order. Keep your order number for reference.</p>';
        if(typeof window.playGenmerchNotificationChime==='function'){
          window.playGenmerchNotificationChime('checkout:success:'+String(order.order_id||order.order_number),'checkout');
        }
        showNotice('Order placed successfully',message);
        showCenteredActionStatus('Order placed successfully!','success',1700);
      }catch(error){
        console.error('GENMERCH checkout submission failed.',error);
        checkoutFeedback(error.message||'Unable to submit this order. Your cart has been kept; please retry.','error');
        showCenteredActionStatus(error.message||'Unable to submit this order. Your cart has been kept; please retry.','error',2400);
      }finally{
        if(isCenteredActionStatusLoading())hideCenteredActionStatus();
        checkoutSubmitting=false;
        if(button){button.disabled=false;button.textContent='Place Order';}
      }
    }
    $('checkoutForm').addEventListener('submit',event=>{
      event.preventDefault();
      submitLiveGenmerchOrder();
    });
    function showNotice(title,html){
      $('noticeTitle').textContent=title;$('noticeContent').innerHTML=html;
      const noticeModal=$('noticeOverlay').querySelector('.notice-modal');
      if(noticeModal)noticeModal.classList.remove('genmerch-help-modal','genmerch-partner-modal');
      $('noticeOverlay').classList.add('open');$('noticeOverlay').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    }
    function closeNotice(){
      if(!$('noticeOverlay').classList.contains('open'))return;
      $('noticeOverlay').classList.remove('open');$('noticeOverlay').setAttribute('aria-hidden','true');
      if(!$('cartModal').classList.contains('open'))document.body.style.overflow='';
    }
    $('closeNoticeButton').addEventListener('click',closeNotice);
    $('noticeOverlay').addEventListener('click',event=>{if(event.target===$('noticeOverlay')){event.preventDefault();event.stopPropagation();}});
    function openPartnerApplication(){
      const formContent = `
        <div class="partner-application-content">
          <p class="partner-application-intro">A few quick steps to introduce your business and explore a partnership with GENMERCH. You can move between steps and review your answers before submitting. Required fields are marked <strong>*</strong>.</p>
          <form id="partnerApplicationForm" novalidate>
            <input type="hidden" id="partnerFormStartedAt" name="form_started_at" value="">
            <div class="partner-honeypot" aria-hidden="true"><label for="partnerWebsiteTrap">Leave this field blank</label><input id="partnerWebsiteTrap" name="website" type="text" tabindex="-1" autocomplete="off"></div>
            <div class="partner-form-stepper" aria-label="Application progress">
              <div class="partner-step-progress-track"><span id="partnerStepProgressBar"></span></div>
              <div class="partner-step-indicators">
                <div class="partner-step-indicator is-active" data-step-indicator="0"><span>1</span><small>Contact</small></div>
                <div class="partner-step-indicator" data-step-indicator="1"><span>2</span><small>Business</small></div>
                <div class="partner-step-indicator" data-step-indicator="2"><span>3</span><small>Finish</small></div>
              </div>
              <p class="partner-step-caption" id="partnerStepCaption">Step 1 of 3 · Contact information</p>
            </div>
            <section class="partner-form-step is-active" data-partner-step="0" aria-label="Contact information">
              <div class="partner-step-heading"><span>01</span><div><h3>Let’s get to know you</h3><p>Start with your contact details.</p></div></div>
              <div class="partner-form-grid">
              <div class="partner-form-field"><label for="partnerFullName">Full name <span class="required">*</span></label><input id="partnerFullName" name="full_name" type="text" autocomplete="name" maxlength="120" required placeholder="Your complete name"></div>
              <div class="partner-form-field"><label for="partnerBusinessName">Business / brand name</label><input id="partnerBusinessName" name="business_name" type="text" autocomplete="organization" maxlength="160" placeholder="Business or shop name (optional)"></div>
              <div class="partner-form-field"><label for="partnerEmail">Email address <span class="required">*</span></label><input id="partnerEmail" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></div>
              <div class="partner-form-field"><label for="partnerPhone">Mobile number <span class="required">*</span></label><input id="partnerPhone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" pattern="09[0-9]{9}" required placeholder="09171234567" title="Use an 11-digit Philippine mobile number beginning with 09."></div>
              <div class="partner-form-field partner-form-field-full"><label for="partnerLocation">City / municipality and province <span class="required">*</span></label><input id="partnerLocation" name="location" type="text" autocomplete="address-level2" maxlength="160" required placeholder="e.g. Mandaluyong City, Metro Manila"></div>
              </div>
            </section>
            <section class="partner-form-step" data-partner-step="1" aria-label="Business and partnership details" hidden>
              <div class="partner-step-heading"><span>02</span><div><h3>Tell us about your business</h3><p>Choose the partnership path that fits your plans.</p></div></div>
              <div class="partner-form-grid">
              <div class="partner-form-field"><label for="partnerType">How would you like to partner? <span class="required">*</span></label><select id="partnerType" name="partner_type" required><option value="">Select partnership type</option><option value="Reseller">Reseller</option><option value="Wholesaler">Wholesaler</option><option value="Brand Affiliate">Brand Affiliate</option></select></div>
              <div class="partner-form-field"><label for="partnerBusinessStage">Business stage</label><select id="partnerBusinessStage" name="business_stage"><option value="">Select one (optional)</option><option value="Already operating">Already selling / operating</option><option value="Starting soon">Planning to start soon</option><option value="Exploring options">Still exploring options</option></select></div>
              <div class="partner-form-field"><label for="partnerSellingChannels">Where do you sell?</label><select id="partnerSellingChannels" name="selling_channels"><option value="">Select selling channel</option><option value="Facebook / Instagram / TikTok">Facebook / Instagram / TikTok</option><option value="Marketplace / online store">Marketplace / online store</option><option value="Physical store">Physical store</option><option value="Multiple channels">Multiple channels</option><option value="Not selling yet">Not selling yet</option></select></div>
              <div class="partner-form-field partner-form-field-full"><label for="partnerSocialLink">Website / shop / social media link</label><input id="partnerSocialLink" name="website_social" type="url" maxlength="240" placeholder="https://... (optional)"></div>
              </div>
            </section>
            <section class="partner-form-step" data-partner-step="2" aria-label="Product interests and confirmation" hidden>
              <div class="partner-step-heading"><span>03</span><div><h3>Almost there</h3><p>Share your interests and confirm your application.</p></div></div>
              <div class="partner-form-grid">
              <div class="partner-form-field"><label for="partnerProductInterest">Products you are interested in</label><select id="partnerProductInterest" name="interested_products"><option value="">Select product interest</option><option value="T-Shirts">T-Shirts</option><option value="Shorts">Shorts</option><option value="Sandos">Sandos</option><option value="Mixed / all categories">Mixed / all categories</option><option value="Other / future releases">Other / future releases</option></select></div>
              <div class="partner-form-field"><label for="partnerOrderVolume">Estimated monthly order volume</label><select id="partnerOrderVolume" name="estimated_monthly_orders"><option value="">Select an estimate</option><option value="1–10 pieces">1–10 pieces</option><option value="11–30 pieces">11–30 pieces</option><option value="31–100 pieces">31–100 pieces</option><option value="More than 100 pieces">More than 100 pieces</option><option value="Not sure yet">Not sure yet</option></select></div>
              
              <div class="partner-form-field"><label for="partnerPreferredContact">Preferred contact method <span class="required">*</span></label><select id="partnerPreferredContact" name="preferred_contact" required><option value="Either">Either email or phone</option><option value="Email">Email</option><option value="Phone">Phone</option></select></div>
              <div class="partner-form-field"><label for="partnerMessage">Anything else we should know?</label><textarea id="partnerMessage" name="message" maxlength="2500" placeholder="Tell us about your goals, target customers, or questions (optional)"></textarea></div>
              </div>
              <label class="partner-consent" for="partnerPrivacyConsent"><input id="partnerPrivacyConsent" name="privacy_consent" type="checkbox" required><span>I confirm that the information above is accurate and allow GENMERCH to use it to review this application and contact me about a potential partnership.</span></label>
              <p class="partner-privacy-note">Please do not include passwords, payment-card details, or sensitive identity documents. See our <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. Application and partner-pricing approval depend on review and agreed terms.</p>
              <div class="partner-form-status" id="partnerApplicationMessage" role="status" aria-live="polite" hidden></div>
              <button class="partner-submit-btn" id="partnerApplicationSubmit" type="submit">Submit Partner Application</button>
            </section>
              <div class="partner-step-actions">
                <button class="partner-step-back" id="partnerStepBack" type="button" hidden>← Back</button>
                <button class="partner-step-next" id="partnerStepNext" type="button">Continue <span aria-hidden="true">→</span></button>
              </div>
          </form>
        </div>`;
      showNotice('Partner With Us — Apply Now',formContent);
      const modal=$('noticeOverlay').querySelector('.notice-modal');
      if(modal)modal.classList.add('genmerch-partner-modal');
      $('partnerFormStartedAt').value=String(Date.now());
      const form=$('partnerApplicationForm');
      form.addEventListener('submit',submitPartnerApplication);
      setupPartnerApplicationSteps(form);
    }

    function setupPartnerApplicationSteps(form){
      const panels=Array.from(form.querySelectorAll('[data-partner-step]'));
      const indicators=Array.from(form.querySelectorAll('[data-step-indicator]'));
      const back=$('partnerStepBack');
      const next=$('partnerStepNext');
      const submit=$('partnerApplicationSubmit');
      const progress=$('partnerStepProgressBar');
      const caption=$('partnerStepCaption');
      const labels=['Contact information','Business profile','Product interests & confirmation'];
      let currentStep=0;
      function showStep(index,animate=true){
        currentStep=Math.max(0,Math.min(panels.length-1,index));
        panels.forEach((panel,i)=>{
          panel.hidden=i!==currentStep;
          panel.classList.toggle('is-active',i===currentStep);
          panel.classList.remove('is-entering');
        });
        indicators.forEach((indicator,i)=>{
          indicator.classList.toggle('is-active',i===currentStep);
          indicator.classList.toggle('is-complete',i<currentStep);
          if(i===currentStep)indicator.setAttribute('aria-current','step');
          else indicator.removeAttribute('aria-current');
        });
        if(progress)progress.style.width=((currentStep/(panels.length-1))*100)+'%';
        if(caption)caption.textContent='Step '+(currentStep+1)+' of '+panels.length+' · '+labels[currentStep];
        if(back)back.hidden=currentStep===0;
        if(next)next.hidden=currentStep===panels.length-1;
        if(submit)submit.hidden=currentStep!==panels.length-1;
        if(animate){
          const active=panels[currentStep];
          active.classList.remove('is-entering');
          void active.offsetWidth;
          active.classList.add('is-entering');
        }
        const content=$('noticeContent');
        if(content)content.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      }
      function validateCurrentStep(){
        const fields=Array.from(panels[currentStep].querySelectorAll('input,select,textarea')).filter(field=>field.willValidate);
        for(const field of fields){
          if(!field.checkValidity()){
            field.reportValidity();
            field.focus({preventScroll:false});
            return false;
          }
        }
        return true;
      }
      if(next)next.addEventListener('click',()=>{
        if(validateCurrentStep())showStep(currentStep+1);
      });
      if(back)back.addEventListener('click',()=>showStep(currentStep-1));
      showStep(0,false);
    }

    async function submitPartnerApplication(event){
      event.preventDefault();
      const form=event.currentTarget;
      const status=$('partnerApplicationMessage');
      const button=$('partnerApplicationSubmit');
      const started=Date.now();
      const fullName=$('partnerFullName').value.trim();
      const email=$('partnerEmail').value.trim();
      const phone=$('partnerPhone').value.trim();
      const location=$('partnerLocation').value.trim();
      if(!fullName||!email||!phone||!location||!$('partnerType').value){
        status.hidden=false;status.className='partner-form-status error';status.textContent='Please complete all required fields before submitting.';return;
      }
      if(!form.reportValidity())return;
      const formData={
        full_name:fullName,
        business_name:$('partnerBusinessName').value.trim(),
        email,
        phone,
        location,
        partner_type:$('partnerType').value,
        business_stage:$('partnerBusinessStage').value,
        selling_channels:$('partnerSellingChannels').value,
        interested_products:$('partnerProductInterest').value,
        estimated_monthly_orders:$('partnerOrderVolume').value,
        website_social:$('partnerSocialLink').value.trim(),
        preferred_contact:$('partnerPreferredContact').value,
        message:$('partnerMessage').value.trim(),
        privacy_consent:$('partnerPrivacyConsent').checked,
        website:$('partnerWebsiteTrap').value,
        form_started_at:Number($('partnerFormStartedAt').value)||started
      };
      button.disabled=true;button.textContent='Submitting application…';
      status.hidden=true;status.textContent='';
      try{
        const client=getCustomerAuthClient();
        const response=await client.functions.invoke('send-genmerch-partner-application',{body:formData});
        let data=response.data||{};
        if(response.error){
          const context=response.error.context;
          if(context&&typeof context.json==='function'){
            try{const errorBody=await context.json();if(errorBody&&errorBody.message)throw new Error(errorBody.message);}catch(parseError){if(parseError instanceof Error&&parseError.message!=='Unexpected end of JSON input')throw parseError;}
          }
          throw new Error('We could not submit your application right now. Please email negosyonipinoy@yahoo.com.ph or call 09750634497.');
        }
        if(!data.ok)throw new Error(data.message||'We could not submit your application right now. Please try again or contact us directly.');
        status.hidden=false;status.className='partner-form-status success';
        status.textContent='Thank you! Your GENMERCH partner application was submitted successfully. Reference: '+String(data.reference_id||'GENMERCH PARTNER')+'. Our team will review your details and contact you using your preferred method.';
        form.reset();$('partnerFormStartedAt').value=String(Date.now());
      }catch(error){
        status.hidden=false;status.className='partner-form-status error';
        status.textContent=(error&&error.message?error.message:'Application submission failed.')+' You may also contact negosyonipinoy@yahoo.com.ph or 09750634497.';
      }finally{
        button.disabled=false;button.textContent='Submit Partner Application';
      }
    }

    function openHelpCenter(){
      const content=`
        <div class="genmerch-help-content" id="genmerchHelpContent">
          <p class="genmerch-help-intro">Welcome to GENMERCH support. Choose the help topic below, or contact our support channels directly.</p>
          <div class="genmerch-help-grid">
            <section class="genmerch-help-card">
              <h3>📦 Track an order</h3>
              <p><strong>Signed-in customers:</strong> open Orders to see the orders linked to your GENMERCH account.</p>
              <p><strong>Guest checkout:</strong> use the full order number from your confirmation and the 11-digit mobile number entered at checkout.</p>
            </section>
            <section class="genmerch-help-card">
              <h3>🚚 Shipping and delivery</h3>
              <p>Open an order to review its latest status. When shipment details are available, the order may show the courier and delivery reference number.</p>
              <p>Courier tracking updates and delivery estimates depend on the shipping provider.</p>
            </section>
            <section class="genmerch-help-card">
              <h3>💳 Payment questions</h3>
              <p>Check the payment method and payment status shown on your order. Selecting an online payment method does not, by itself, mean a payment was automatically charged.</p>
              <p>Use the verified instructions shown at checkout and contact support if the recorded payment status looks incorrect.</p>
            </section>
            <section class="genmerch-help-card">
              <h3>🧾 Order number and account</h3>
              <p>Keep your GENMERCH order number when asking for assistance. Account orders appear under the account used when placing the order.</p>
              <p>For guest orders, provide the order number and checkout mobile number in the Track Order form.</p>
            </section>
            <section class="genmerch-help-card">
              <h3>✉️ Email support</h3>
              <p>Send order questions to <a href="mailto:negosyonipinoy@gmail.com?subject=GENMERCH%20Customer%20Support">negosyonipinoy@gmail.com</a>.</p>
              <p>Include the order number and a short description of the issue. Do not send your password or one-time codes.</p>
            </section>
            <section class="genmerch-help-card">
              <h3>☎️ Telephone support</h3>
              <p><a href="tel:09750634497">09750634497</a></p>
              <p>Tap the number on a phone or supported device to start a call.</p>
            </section>
          </div>
          <div class="genmerch-help-actions">
            <button class="primary-btn" id="helpTrackOrderButton" type="button">📦 Track My Order</button>
            <a class="secondary-btn" href="mailto:negosyonipinoy@gmail.com?subject=GENMERCH%20Customer%20Support">✉️ Email Support</a>
            <a class="secondary-btn" href="tel:09750634497">☎️ Call Support</a>
          </div>
          <p class="genmerch-help-hours-note">Support response times are not listed here. Please use the contact details above; never share account passwords or verification codes.</p>
        </div>`;
      showNotice('GENMERCH Help Center',content);
      const modal=$('noticeOverlay').querySelector('.notice-modal');
      if(modal){
        modal.classList.add('genmerch-help-modal');
        const title=$('noticeTitle');
        const closeButton=$('closeNoticeButton');
        if(title&&closeButton){
          let header=modal.querySelector('.genmerch-help-header');
          if(!header){
            header=document.createElement('div');
            header.className='genmerch-help-header';
            modal.insertBefore(header,title);
          }
          header.appendChild(title);
          header.appendChild(closeButton);
          closeButton.classList.remove('primary-btn');
          closeButton.classList.add('genmerch-help-close');
          closeButton.type='button';
          closeButton.textContent='×';
          closeButton.setAttribute('aria-label','Close GENMERCH Help Center');
          closeButton.setAttribute('title','Close Help Center');
        }
      }
      const trackButton=$('helpTrackOrderButton');
      if(trackButton)trackButton.addEventListener('click',()=>{
        closeNotice();
        openCustomerOrders();
      });
    }
    function showInfo(section){
      const key=String(section||'').trim().toLowerCase();
      if(key==='track order'||key==='track my order'||key==='orders'){
        openCustomerOrders();
        return;
      }
      if(key==='help'||key==='help center'||key==='support'){
        openHelpCenter();
        return;
      }
      if(key==='updates'){
        openCustomerOrders();
        return;
      }
      showNotice(section, "<p>The product is not listed yet, don't worry it will be all listed soon! 😊</p>");
    }

    function openBusinessRegInfo(){
      const overlay=$('businessRegOverlay');
      if(!overlay)return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      const closeButton=$('closeBusinessRegTop');
      if(closeButton)closeButton.focus();
    }
    function closeBusinessRegInfo(){
      const overlay=$('businessRegOverlay');
      if(!overlay||!overlay.classList.contains('open'))return;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      if(!document.querySelector('.customer-orders-overlay.open,.wishlist-overlay.open,.cart-overlay.open,.cart-modal.open,.overlay.open,.customer-auth-overlay.open,.seller-modal-overlay.open,.size-overlay.open')){
        document.body.style.overflow='';
      }
    }
    $('closeBusinessRegTop').addEventListener('click',closeBusinessRegInfo);
    $('closeBusinessRegButton').addEventListener('click',closeBusinessRegInfo);
    $('businessRegOverlay').addEventListener('click',event=>{if(event.target===$('businessRegOverlay')){event.preventDefault();event.stopPropagation();}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('businessRegOverlay').classList.contains('open'))closeBusinessRegInfo();});

    function openDtiRegInfo(){
      const overlay=$('dtiRegOverlay');
      if(!overlay)return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      const closeButton=$('closeDtiRegTop');
      if(closeButton)closeButton.focus();
    }
    function closeDtiRegInfo(){
      const overlay=$('dtiRegOverlay');
      if(!overlay||!overlay.classList.contains('open'))return;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      if(!document.querySelector('.customer-orders-overlay.open,.wishlist-overlay.open,.cart-overlay.open,.cart-modal.open,.overlay.open,.customer-auth-overlay.open,.seller-modal-overlay.open,.size-overlay.open')){
        document.body.style.overflow='';
      }
    }
    $('closeDtiRegTop').addEventListener('click',closeDtiRegInfo);
    $('closeDtiRegButton').addEventListener('click',closeDtiRegInfo);
    $('dtiRegOverlay').addEventListener('click',event=>{if(event.target===$('dtiRegOverlay')){event.preventDefault();event.stopPropagation();}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('dtiRegOverlay').classList.contains('open'))closeDtiRegInfo();});

    // Customer email + password authentication using Supabase Auth v2.
    let customerAuthClient = null;
    let customerAuthSubscription = null;
    let customerAuthCurrentSession = null;
    let customerAuthBusy = false;
    let customerAuthRecoveryMode = false;
    let customerAuthForgotMode = false;
    let customerAuthMode = 'signin';
    const CUSTOMER_GOOGLE_OAUTH_PENDING_KEY = 'genmerchGoogleOAuthPendingAt';
    const CUSTOMER_GOOGLE_OAUTH_PENDING_MAX_AGE_MS = 10 * 60 * 1000;

    function clearCustomerGoogleOAuthPending(){
      try{sessionStorage.removeItem(CUSTOMER_GOOGLE_OAUTH_PENDING_KEY);}catch(_){}
    }
    function hasPendingCustomerGoogleOAuth(){
      try{
        const raw=sessionStorage.getItem(CUSTOMER_GOOGLE_OAUTH_PENDING_KEY);
        if(!raw)return false;
        const startedAt=Number(raw),age=Date.now()-startedAt;
        if(!Number.isFinite(startedAt)||age< -60000||age>CUSTOMER_GOOGLE_OAUTH_PENDING_MAX_AGE_MS){
          clearCustomerGoogleOAuthPending();
          return false;
        }
        return true;
      }catch(_){return false;}
    }
    function showCustomerGoogleOAuthError(message){
      const overlay=$('customerAuthOverlay');
      if(!overlay)return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      if(!customerAuthCurrentSession){
        setCustomerAuthMode('signin');
        updateCustomerAuthScreen(null);
      }
      setCustomerAuthMessage(message,'error');
    }

    function isCustomerAuthCallbackUrl(){
      const url=new URL(window.location.href);
      return url.searchParams.has('code') ||
        url.searchParams.has('error') ||
        url.searchParams.has('error_description') ||
        url.hash.includes('access_token=') ||
        url.hash.includes('error_description=');
    }
    function getCustomerAuthRedirectUrl(){
      return 'https://shopgenmerch.com/';
    }
    function isCustomerPasswordRecoveryCallbackUrl(){
      const url=new URL(window.location.href);
      return url.searchParams.get('type')==='recovery' ||
        url.hash.includes('type=recovery') ||
        url.hash.includes('genmerch-password-recovery');
    }

    // Native Google Sheets export uses a short-lived Google OAuth provider token.
    // The token stays in this browser tab only; no Google token is written to the database.
    const GM_SHEETS_TOKEN_KEY='genmerchGoogleSheetsProviderToken';
    const GM_SHEETS_TOKEN_AT_KEY='genmerchGoogleSheetsProviderTokenAt';
    const GM_SHEETS_SCOPE_READY_KEY='genmerchGoogleSheetsDriveFileScopeReady';
    const GM_SHEETS_OAUTH_PENDING_KEY='genmerchGoogleSheetsOAuthPending';
    const GM_SHEETS_OAUTH_USER_KEY='genmerchGoogleSheetsOAuthExpectedUser';
    function sellerSheetsSessionValue(key){
      try{return window.sessionStorage.getItem(key)||'';}catch(_){return '';}
    }
    function sellerSheetsSetSessionValue(key,value){
      try{if(value)window.sessionStorage.setItem(key,String(value));else window.sessionStorage.removeItem(key);}catch(_){}
    }
    function sellerCaptureGoogleSheetsSessionToken(event,session){
      if(event==='SIGNED_OUT'){
        [GM_SHEETS_TOKEN_KEY,GM_SHEETS_TOKEN_AT_KEY,GM_SHEETS_SCOPE_READY_KEY,GM_SHEETS_OAUTH_PENDING_KEY,GM_SHEETS_OAUTH_USER_KEY].forEach(key=>sellerSheetsSetSessionValue(key,''));
        return;
      }
      if(!session||!session.provider_token)return;
      const pending=sellerSheetsSessionValue(GM_SHEETS_OAUTH_PENDING_KEY)==='1';
      const expectedUserId=sellerSheetsSessionValue(GM_SHEETS_OAUTH_USER_KEY);
      const actualUserId=String(session.user&&session.user.id||'');
      if(pending&&expectedUserId&&actualUserId!==expectedUserId){
        [GM_SHEETS_TOKEN_KEY,GM_SHEETS_TOKEN_AT_KEY,GM_SHEETS_SCOPE_READY_KEY,GM_SHEETS_OAUTH_PENDING_KEY,GM_SHEETS_OAUTH_USER_KEY].forEach(key=>sellerSheetsSetSessionValue(key,''));
        window.setTimeout(()=>showToast('Google authorization returned a different GENMERCH account. Reopen Seller Centre with the authorized admin account.'),900);
        return;
      }
      sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_KEY,session.provider_token);
      sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_AT_KEY,String(Date.now()));
      if(pending){
        sellerSheetsSetSessionValue(GM_SHEETS_SCOPE_READY_KEY,'1');
        sellerSheetsSetSessionValue(GM_SHEETS_OAUTH_PENDING_KEY,'');
        sellerSheetsSetSessionValue(GM_SHEETS_OAUTH_USER_KEY,'');
        window.setTimeout(()=>{
          sellerFeedback('sellerInventoryFeedback','Google Sheets access connected. Click Google Sheets Export again to create your live report.','success');
          showToast('Google Sheets connected. Click Export again to create the report.');
        },1200);
      }
    }
    async function sellerStartGoogleSheetsAuthorization(client,userId){
      sellerSheetsSetSessionValue(GM_SHEETS_OAUTH_PENDING_KEY,'1');
      sellerSheetsSetSessionValue(GM_SHEETS_OAUTH_USER_KEY,String(userId||''));
      try{
        const {data,error}=await client.auth.signInWithOAuth({
          provider:'google',
          options:{
            redirectTo:getCustomerAuthRedirectUrl(),
            scopes:'https://www.googleapis.com/auth/drive.file',
            queryParams:{access_type:'offline',prompt:'consent',include_granted_scopes:'true'},
            skipBrowserRedirect:true
          }
        });
        if(error)throw error;
        if(!data||!data.url)throw new Error('Google did not return an authorization URL. Please try again.');
        showCenteredActionStatus('Connecting Google Sheets access…','loading');
        window.location.assign(data.url);
      }catch(error){
        [GM_SHEETS_OAUTH_PENDING_KEY,GM_SHEETS_OAUTH_USER_KEY].forEach(key=>sellerSheetsSetSessionValue(key,''));
        throw error;
      }
    }
    async function sellerGoogleSheetsApiRequest(url,token,options={}){
      const response=await fetch(url,{
        ...options,
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        const message=String(data&&data.error&&data.error.message||'Google Sheets API request failed ('+response.status+').');
        const error=new Error(message);
        error.status=response.status;
        error.apiError=data&&data.error?data.error:{};
        throw error;
      }
      return data;
    }
    function sellerGoogleSheetLinkFeedback(message,url){
      sellerFeedback('sellerInventoryFeedback',message,url?'success':'error');
      const node=$('sellerInventoryFeedback');
      if(node&&url){
        node.appendChild(document.createTextNode(' '));
        const link=document.createElement('a');
        link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open Google Sheet';
        link.style.fontWeight='800';link.style.textDecoration='underline';
        node.appendChild(link);
      }
    }

    // Send one welcome email to newly-created accounts, never on every ordinary sign-in.
    const customerWelcomeEmailAttemptAtByUserId=new Map();
    const CUSTOMER_WELCOME_EMAIL_WINDOW_MS=72*60*60*1000;
    const CUSTOMER_WELCOME_EMAIL_RETRY_COOLDOWN_MS=5*60*1000;
    function maybeSendCustomerWelcomeEmail(session){
      const user=session&&session.user;
      const userId=String(user&&user.id||'');
      const email=String(user&&user.email||'').trim();
      const createdAt=new Date(String(user&&user.created_at||'')).getTime();
      const age=Date.now()-createdAt;
      if(!userId||!email||!Number.isFinite(createdAt)||age< -5*60*1000||age>CUSTOMER_WELCOME_EMAIL_WINDOW_MS)return;
      const lastAttempt=customerWelcomeEmailAttemptAtByUserId.get(userId)||0;
      if(Date.now()-lastAttempt<CUSTOMER_WELCOME_EMAIL_RETRY_COOLDOWN_MS)return;
      customerWelcomeEmailAttemptAtByUserId.set(userId,Date.now());
      // Defer the network call until after the Supabase auth-state callback returns.
      window.setTimeout(async()=>{
        try{
          const client=getCustomerAuthClient();
          const result=await client.functions.invoke('send-genmerch-welcome-email',{body:{}});
          if(result.error)throw result.error;
          if(result.data&&!result.data.ok&&!result.data.already_sent&&result.data.eligible!==false){
            console.warn('GENMERCH welcome email was not completed.',result.data.message||result.data.code||'Unknown email error.');
          }else if(result.data&&result.data.ok&&result.data.delivery_status==='accepted_by_resend'){
            console.info('GENMERCH welcome email was accepted by Resend for '+email+'.');
          }
        }catch(error){
          console.warn('GENMERCH account was created/signed in, but welcome email delivery could not be confirmed.',error&&error.message?error.message:error);
        }
      },0);
    }

    function getCustomerAuthClient(){
      if(customerAuthClient)return customerAuthClient;
      if(!window.supabase||typeof window.supabase.createClient!=='function'){
        throw new Error('The sign-in service could not load. Refresh the page and try again.');
      }
      customerAuthClient=window.supabase.createClient(GENMERCH_SUPABASE_URL,GENMERCH_SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
      });
      if(!customerAuthSubscription){
        const result=customerAuthClient.auth.onAuthStateChange((event,session)=>{
          sellerCaptureGoogleSheetsSessionToken(event,session);
          updateCustomerAuthScreen(session);
          if(event==='PASSWORD_RECOVERY'){
            window.setTimeout(()=>openCustomerPasswordRecovery('Your reset link is verified. Choose a new password.','success'),0);
          }
          if(event==='SIGNED_IN'&&session&&session.user&&typeof window.playGenmerchNotificationChime==='function'){
            const welcomeKey='welcome:'+String(session.user.id||'customer')+':'+String(session.expires_at||Date.now());
            window.setTimeout(()=>window.playGenmerchNotificationChime(welcomeKey,'welcome'),80);
          }
          window.setTimeout(()=>syncCustomerOrdersBadgeRealtime(session),0);
          window.setTimeout(()=>refreshCustomerRateBadge(session),0);
          window.setTimeout(()=>maybeSendCustomerWelcomeEmail(session),0);
          syncWishlistForCustomerSession(session,true);
          window.dispatchEvent(new CustomEvent('genmerch:customer-auth-changed',{detail:session||null}));
          if(event==='SIGNED_OUT'){
            clearCustomerGoogleOAuthPending();
            if(customerDraftCloudSaveTimer!==null){window.clearTimeout(customerDraftCloudSaveTimer);customerDraftCloudSaveTimer=null;}
            customerDraftCloudReadyUserId='';
            try{
              const draftOwner=localStorage.getItem(GENMERCH_DRAFT_OWNER_KEY)||'';
              if(draftOwner){
                localStorage.removeItem(GENMERCH_DRAFT_STORAGE_KEY);
                localStorage.removeItem(GENMERCH_DRAFT_OWNER_KEY);
                localStorage.removeItem(GENMERCH_DRAFT_UPDATED_AT_KEY);
              }
            }catch(_){}
            resetDraftInMemory();
            updateCart();
          }else if(session&&session.user){
            const pendingCheckoutDraft=readPendingCheckoutAuthDraft();
            if(pendingCheckoutDraft){
              if(!checkoutAuthResumeInFlight){
                checkoutAuthResumeInFlight=true;
                syncCustomerDraftForSession(session,true)
                  .catch(error=>console.warn('GENMERCH account draft sync before checkout restoration failed.',error))
                  .then(()=>resumePendingCheckoutAfterAuth(session,pendingCheckoutDraft))
                  .catch(error=>console.error('GENMERCH checkout resume failed.',error))
                  .finally(()=>{checkoutAuthResumeInFlight=false;});
              }
            }else{
              syncCustomerDraftForSession(session,true);
            }
          }
          if($('customerOrdersOverlay')&&$('customerOrdersOverlay').classList.contains('open'))loadCustomerAccountOrders(true);
          if(event==='SIGNED_IN'&&session&&session.user&&(isCustomerAuthCallbackUrl()||hasPendingCustomerGoogleOAuth())){
            clearCustomerGoogleOAuthPending();
            const identity=getCustomerAuthIdentity(session.user);
            const overlay=$('customerAuthOverlay');
            if(overlay&&overlay.classList.contains('open')){
              setCustomerAuthMessage('Successfully signed in.','success');
              closeCustomerAuth();
            }
            showToast('Signed in as '+identity);
            try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}
          }
        });
        customerAuthSubscription=result.data&&result.data.subscription?result.data.subscription:null;
      }
      return customerAuthClient;
    }
    function getCustomerAuthIdentity(user){
      const metadata=user&&user.user_metadata?user.user_metadata:{};
      return String(metadata.full_name||metadata.name||(user&&user.email)||(user&&user.phone)||'Your GENMERCH account');
    }
    function setCustomerAuthMessage(message,type=''){
      const node=$('customerAuthMessage');
      if(!node)return;
      node.textContent=message||'';
      node.className='customer-auth-message'+(type?' '+type:'');
      node.hidden=!message;
    }
    function setCustomerAuthMode(mode){
      customerAuthMode=mode==='signup'?'signup':'signin';
      customerAuthForgotMode=false;
      const signIn=$('customerAuthSignInTab');
      const create=$('customerAuthCreateTab');
      const nameField=$('customerFullNameField');
      const nameInput=$('customerFullName');
      const password=$('customerPassword');
      const submit=$('customerPasswordSubmit');
      $('customerAuthTabs').hidden=false;
      $('customerPasswordField').hidden=false;
      $('customerAuthDivider').hidden=false;
      $('customerGoogleButton').hidden=false;
      $('customerForgotBackButton').hidden=true;
      password.required=true;
      signIn.classList.toggle('active',customerAuthMode==='signin');
      create.classList.toggle('active',customerAuthMode==='signup');
      signIn.setAttribute('aria-selected',String(customerAuthMode==='signin'));
      create.setAttribute('aria-selected',String(customerAuthMode==='signup'));
      nameField.hidden=customerAuthMode!=='signup';
      nameInput.required=customerAuthMode==='signup';
      password.autocomplete=customerAuthMode==='signup'?'new-password':'current-password';
      submit.textContent=customerAuthMode==='signup'?'Create Account':'Sign In';
      $('customerAuthTitle').innerHTML='Welcome to <span class="customer-auth-wordmark"><span class="customer-auth-word-gen">GEN</span><span class="customer-auth-word-merch">MERCH</span></span>';
      const subtitle=$('customerAuthSubtitle');
      const forgotRow=$('customerAuthForgotRow');
      if(forgotRow)forgotRow.hidden=customerAuthMode!=='signin';
      if(subtitle)subtitle.textContent=customerAuthMode==='signup'
        ?'Create your account to shop with GENMERCH.'
        :'Sign in to your GENMERCH customer account.';
      setCustomerAuthMessage('');
    }
    function customerAuthFriendlyError(error,mode){
      const raw=String(error&&error.message||'Authentication could not be completed. Please try again.');
      const normalized=raw.toLowerCase();
      if(normalized.includes('invalid login credentials')){
        return 'Incorrect email or password. Check your details and try again.';
      }
      if(normalized.includes('user already registered')||normalized.includes('user already exists')||normalized.includes('already been registered')){
        return 'An account with this email may already exist. Switch to Sign In and try your password.';
      }
      if(normalized.includes('password should be at least')||normalized.includes('password is too short')){
        return 'Choose a password that meets the minimum length required by the account service.';
      }
      if(normalized.includes('email rate limit')||normalized.includes('sending rate limit')){
        return 'Supabase has temporarily limited email activity for this project. If this happened during account creation, check Supabase email confirmation settings and email-delivery limits.';
      }
      if(normalized.includes('email not confirmed')){
        return 'This email still needs confirmation in Supabase before sign-in. Check your inbox or review the project email-confirmation setting.';
      }
      if(normalized.includes('provider is not enabled')||normalized.includes('unsupported provider')){
        return mode==='google'
          ?'Google sign-in is not configured in Supabase yet. Enable Google and configure its OAuth client ID, secret, and callback URL.'
          :raw;
      }
      return raw;
    }
    function refreshCustomerAccountLabelForViewport(){
      const button=$('customerAccountButton');
      const label=$('customerAccountLabel');
      if(!button||!label||!button.classList.contains('customer-account-signed-in'))return;
      label.textContent='Account';
    }
    function updateCustomerAuthScreen(session){
      customerAuthCurrentSession=session&&session.user?session:null;
      const signedIn=Boolean(customerAuthCurrentSession);
      const user=signedIn?customerAuthCurrentSession.user:null;
      const identity=signedIn?getCustomerAuthIdentity(user):'';
      const accountLabel=$('customerAccountLabel');
      const accountButton=$('customerAccountButton');
      if(accountLabel){accountLabel.dataset.fullName=signedIn?identity:'';accountLabel.textContent=signedIn?'Account':'Sign in';}
      if(accountButton){
        accountButton.setAttribute('aria-label',signedIn?'Account: '+identity+'. Open account options':'Sign in or create your GENMERCH customer account');
        accountButton.title=signedIn?identity:'Sign in or Create Account';
        accountButton.classList.toggle('customer-account-signed-in',signedIn);
      }
      $('customerAuthSignedIn').hidden=!signedIn;
      $('customerAuthMethods').hidden=signedIn;
      const accountEmail=signedIn?String(user.email||'').trim():'';
      const accountEmailNode=$('customerAuthEmail');
      if(accountEmailNode){
        accountEmailNode.textContent=accountEmail;
        accountEmailNode.hidden=!accountEmail;
      }
      if(signedIn){
        $('customerAuthIdentity').textContent=identity;
        $('customerAuthTitle').innerHTML='Your <span class="customer-auth-wordmark"><span class="customer-auth-word-gen">GEN</span><span class="customer-auth-word-merch">MERCH</span></span> Account';
        $('customerAuthMessage').hidden=true;
      }else if(!$('customerAuthOverlay').classList.contains('open')||!customerAuthBusy){
        $('customerAuthTitle').innerHTML='Welcome to <span class="customer-auth-wordmark"><span class="customer-auth-word-gen">GEN</span><span class="customer-auth-word-merch">MERCH</span></span>';
      }
      if(customerAuthRecoveryMode){
        $('customerAuthMethods').hidden=true;
        $('customerAuthSignedIn').hidden=true;
        $('customerPasswordRecoveryForm').hidden=false;
      }else{
        $('customerPasswordRecoveryForm').hidden=true;
      }
      if(accountLabel&&signedIn)accountLabel.textContent='Account';
    }
    window.addEventListener('resize',refreshCustomerAccountLabelForViewport,{passive:true});
    let customerAuthBackgroundScrollState=null;
    function lockCustomerAuthBackgroundScroll(){
      if(customerAuthBackgroundScrollState||!document.body)return;
      const body=document.body,root=document.documentElement;
      const scrollY=Math.max(0,window.scrollY||window.pageYOffset||0);
      customerAuthBackgroundScrollState={
        scrollY,
        bodyPosition:body.style.position,
        bodyTop:body.style.top,
        bodyLeft:body.style.left,
        bodyRight:body.style.right,
        bodyWidth:body.style.width,
        bodyHeight:body.style.height,
        bodyOverflow:body.style.overflow,
        bodyOverscrollBehavior:body.style.overscrollBehavior,
        rootOverflow:root.style.overflow,
        rootOverscrollBehavior:root.style.overscrollBehavior
      };
      root.classList.add('customer-auth-scroll-locked');
      root.style.overflow='hidden';
      root.style.overscrollBehavior='none';
      body.style.position='fixed';
      body.style.top='-'+scrollY+'px';
      body.style.left='0';
      body.style.right='0';
      body.style.width='100%';
      body.style.height='100%';
      body.style.overflow='hidden';
      body.style.overscrollBehavior='none';
    }
    function unlockCustomerAuthBackgroundScroll(){
      const saved=customerAuthBackgroundScrollState;
      if(!saved)return;
      const body=document.body,root=document.documentElement;
      customerAuthBackgroundScrollState=null;
      root.classList.remove('customer-auth-scroll-locked');
      root.style.overflow=saved.rootOverflow;
      root.style.overscrollBehavior=saved.rootOverscrollBehavior;
      body.style.position=saved.bodyPosition;
      body.style.top=saved.bodyTop;
      body.style.left=saved.bodyLeft;
      body.style.right=saved.bodyRight;
      body.style.width=saved.bodyWidth;
      body.style.height=saved.bodyHeight;
      body.style.overflow=saved.bodyOverflow;
      body.style.overscrollBehavior=saved.bodyOverscrollBehavior;
      window.requestAnimationFrame(()=>window.scrollTo(0,saved.scrollY));
    }

    function openCustomerPasswordRecovery(message='Your reset link is verified. Choose a new password.',type='success'){
      customerAuthRecoveryMode=true;
      const overlay=$('customerAuthOverlay');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      lockCustomerAuthBackgroundScroll();
      $('customerAuthMethods').hidden=true;
      $('customerAuthSignedIn').hidden=true;
      $('customerPasswordRecoveryForm').hidden=false;
      $('customerAuthTitle').innerHTML='Reset your <span class="customer-auth-wordmark"><span class="customer-auth-word-gen">GEN</span><span class="customer-auth-word-merch">MERCH</span></span> password';
      $('customerAuthSubtitle').textContent='Choose a new password for your account.';
      $('customerResetPassword').value='';
      $('customerResetPasswordConfirm').value='';
      setCustomerAuthMessage(message,type);
      window.setTimeout(()=>{const input=$('customerResetPassword');if(input&&!input.disabled)input.focus();},0);
    }
    async function cancelCustomerPasswordRecovery(){
      if(customerAuthBusy)return;
      let client=null;
      try{
        client=getCustomerAuthClient();
        const result=await client.auth.signOut();
        if(result.error)throw result.error;
      }catch(error){
        console.warn('GENMERCH password recovery session could not be closed cleanly.',error);
      }
      customerAuthRecoveryMode=false;
      $('customerPasswordRecoveryForm').hidden=true;
      $('customerAuthMethods').hidden=false;
      updateCustomerAuthScreen(null);
      setCustomerAuthMode('signin');
      setCustomerAuthMessage('');
      $('customerEmail').focus();
    }
    $('customerPasswordRecoveryCancel').addEventListener('click',cancelCustomerPasswordRecovery);
    function openCustomerAuth(){
      $('customerAuthOverlay').classList.add('open');
      $('customerAuthOverlay').setAttribute('aria-hidden','false');
      lockCustomerAuthBackgroundScroll();
      setCustomerAuthMessage('');
      try{
        const client=getCustomerAuthClient();
        client.auth.getSession().then(({data,error})=>{
          if(error)throw error;
          updateCustomerAuthScreen(data.session);
          if(!data.session)setCustomerAuthMode(customerAuthMode);
        }).catch(error=>setCustomerAuthMessage(error.message||'Could not load your sign-in session.','error'));
      }catch(error){
        setCustomerAuthMessage(error.message||'The sign-in service is unavailable.','error');
      }
    }
    function closeCustomerAuth(){
      $('customerAuthOverlay').classList.remove('open');
      $('customerAuthOverlay').setAttribute('aria-hidden','true');
      unlockCustomerAuthBackgroundScroll();
    }
    $('customerAuthClose').addEventListener('click',closeCustomerAuth);
    $('customerAuthOverlay').addEventListener('click',event=>{
      if(event.target===$('customerAuthOverlay')){event.preventDefault();event.stopPropagation();}
    });
    $('customerAuthSignInTab').addEventListener('click',()=>setCustomerAuthMode('signin'));
    $('customerAuthCreateTab').addEventListener('click',()=>setCustomerAuthMode('signup'));
    function bindCustomerPasswordReveal(inputId,toggleId,shownLabel,hiddenLabel){
      const input=$(inputId),toggle=$(toggleId);
      if(!input||!toggle||toggle.dataset.passwordRevealBound==='true')return;
      toggle.dataset.passwordRevealBound='true';
      const toggleVisibility=(event)=>{
        if(event){event.preventDefault();event.stopPropagation();}
        const show=input.type==='password';
        input.type=show?'text':'password';
        toggle.textContent=show?'Hide':'Show';
        toggle.setAttribute('aria-label',show?hiddenLabel:shownLabel);
        toggle.setAttribute('aria-pressed',String(show));
      };
      // Toggle immediately on pointer press so mobile taps don't depend on a delayed synthetic click.
      toggle.addEventListener('pointerdown',event=>{
        if(event.pointerType==='mouse'&&event.button!==0)return;
        toggleVisibility(event);
      });
      // Keep keyboard and assistive-technology activation working; ignore pointer-generated clicks
      // because those were already handled on pointerdown.
      toggle.addEventListener('click',event=>{
        if(event.detail!==0){event.preventDefault();event.stopPropagation();return;}
        toggleVisibility(event);
      });
    }
    bindCustomerPasswordReveal('customerPassword','customerPasswordToggle','Show password','Hide password');
    bindCustomerPasswordReveal('customerResetPassword','customerResetPasswordToggle','Show new password','Hide new password');
    bindCustomerPasswordReveal('customerResetPasswordConfirm','customerResetPasswordConfirmToggle','Show confirmation password','Hide confirmation password');
    async function submitCustomerForgotPassword(){
      if(customerAuthBusy)return;
      const email=$('customerEmail').value.trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        setCustomerAuthMessage('Enter a valid email address.','error');
        $('customerEmail').focus();
        return;
      }
      let client;
      try{client=getCustomerAuthClient();}
      catch(error){setCustomerAuthMessage(error.message||'The sign-in service is unavailable.','error');return;}
      customerAuthBusy=true;
      const submit=$('customerPasswordSubmit');
      const back=$('customerForgotBackButton');
      submit.disabled=true;
      back.disabled=true;
      submit.textContent='Sending reset link…';
      setCustomerAuthMessage('Requesting a secure password reset link…');
      try{
        const {error}=await client.auth.resetPasswordForEmail(email,{
          redirectTo:getCustomerAuthRedirectUrl()+'#genmerch-password-recovery'
        });
        if(error)throw error;
        setCustomerAuthMessage('If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.','success');
        showToast('Please check your email.',5000);
      }catch(error){
        const raw=String(error&&error.message||'Password reset could not be requested. Please try again.');
        const normalized=raw.toLowerCase();
        let message=customerAuthFriendlyError(error,'recovery');
        if(normalized.includes('redirect')&&normalized.includes('url')){
          message='Supabase blocked the reset redirect. In Authentication → URL Configuration, make sure https://shopgenmerch.com/ is an allowed redirect URL.';
        }else if(normalized.includes('email rate limit')||normalized.includes('sending rate limit')){
          message='Password-reset emails are temporarily rate-limited. Wait a little before trying again.';
        }
        setCustomerAuthMessage(message,'error');
      }finally{
        customerAuthBusy=false;
        submit.disabled=false;
        submit.textContent='Send Reset Link';
        back.disabled=false;
      }
    }
    $('customerAuthForgotPassword').addEventListener('click',()=>{
      if(customerAuthBusy)return;
      setCustomerAuthMode('signin');
      customerAuthForgotMode=true;
      $('customerAuthTabs').hidden=true;
      $('customerPasswordField').hidden=true;
      $('customerPassword').required=false;
      $('customerPassword').value='';
      $('customerAuthDivider').hidden=true;
      $('customerGoogleButton').hidden=true;
      $('customerAuthForgotRow').hidden=true;
      $('customerForgotBackButton').hidden=false;
      $('customerPasswordSubmit').textContent='Send Reset Link';
      $('customerAuthTitle').textContent='Forgot your password?';
      $('customerAuthSubtitle').textContent='Enter the email address for your GENMERCH account. We’ll send a secure reset link.';
      setCustomerAuthMessage('');
      $('customerEmail').focus();
    });
    $('customerForgotBackButton').addEventListener('click',()=>{
      if(customerAuthBusy)return;
      setCustomerAuthMode('signin');
      $('customerPassword').value='';
      $('customerEmail').focus();
    });
    $('customerPasswordForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(customerAuthBusy)return;
      if(customerAuthForgotMode){await submitCustomerForgotPassword();return;}
      const email=$('customerEmail').value.trim();
      const password=$('customerPassword').value;
      const fullName=$('customerFullName').value.trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        setCustomerAuthMessage('Enter a valid email address.','error');
        $('customerEmail').focus();
        return;
      }
      if(password.length<6){
        setCustomerAuthMessage('Password must be at least 6 characters.','error');
        $('customerPassword').focus();
        return;
      }
      if(customerAuthMode==='signup'&&fullName.length<2){
        setCustomerAuthMessage('Enter your full name to create a customer account.','error');
        $('customerFullName').focus();
        return;
      }
      let client;
      try{client=getCustomerAuthClient();}
      catch(error){setCustomerAuthMessage(error.message||'The sign-in service is unavailable.','error');return;}
      customerAuthBusy=true;
      const submit=$('customerPasswordSubmit');
      const originalLabel=customerAuthMode==='signup'?'Create Account':'Sign In';
      submit.disabled=true;
      submit.textContent=customerAuthMode==='signup'?'Creating account…':'Signing in…';
      $('customerGoogleButton').disabled=true;
      setCustomerAuthMessage(customerAuthMode==='signup'?'Creating your customer account…':'Signing in…');
      try{
        let data,error;
        if(customerAuthMode==='signup'){
          const result=await client.auth.signUp({
            email,
            password,
            options:{data:{full_name:fullName}}
          });
          data=result.data;error=result.error;
          if(error)throw error;

          // Supabase can return a user-shaped response for an email that is already
          // registered, with an empty identities array, to limit account enumeration.
          // This is not a newly created account: do not announce success or retry login.
          if(data&&data.user&&!data.session&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
            setCustomerAuthMessage('We could not complete account creation with these details. If you already have a GENMERCH account, switch to Sign In. If you are creating a new account, verify the email address and try again.','error');
            return;
          }

          // If a new user was returned without a session, immediately try to sign
          // in using the same credentials. This supports projects that confirm new
          // users as part of signup via a database trigger or server-side setting.
          if(data&&data.user&&!data.session){
            setCustomerAuthMessage('Account request received. Signing you in…','success');
            submit.textContent='Signing you in…';
            const loginResult=await client.auth.signInWithPassword({email,password});
            if(loginResult.error)throw loginResult.error;
            data=loginResult.data;
          }
        }else{
          const result=await client.auth.signInWithPassword({email,password});
          data=result.data;error=result.error;
        }
        if(error)throw error;
        if(data&&data.session&&data.user){
          updateCustomerAuthScreen(data.session);
          setCustomerAuthMessage(customerAuthMode==='signup'?'Your GENMERCH account was created successfully.':'Welcome back! You are signed in.','success');
          const identity=getCustomerAuthIdentity(data.user);
          const successToast=(customerAuthMode==='signup'?'Account created. Signed in as ':'Signed in as ')+identity;
          if($('customerAuthOverlay').classList.contains('open'))closeCustomerAuth();
          showToast(successToast);
        }else if(customerAuthMode==='signup'&&data&&data.user){
          setCustomerAuthMessage('Your account was created, but Supabase did not complete the login session. Please try signing in with your new account.','error');
        }else{
          setCustomerAuthMessage('Supabase did not return a signed-in session. Please check the account settings and try again.','error');
        }
      }catch(error){
        setCustomerAuthMessage(customerAuthFriendlyError(error,customerAuthMode),'error');
      }finally{
        customerAuthBusy=false;
        submit.disabled=false;
        submit.textContent=originalLabel;
        $('customerGoogleButton').disabled=false;
      }
    });
    $('customerPasswordRecoveryForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(customerAuthBusy)return;
      const password=$('customerResetPassword').value;
      const confirmation=$('customerResetPasswordConfirm').value;
      if(password.length<6){
        setCustomerAuthMessage('Your new password must be at least 6 characters.','error');
        $('customerResetPassword').focus();
        return;
      }
      if(password!==confirmation){
        setCustomerAuthMessage('The passwords do not match. Please enter them again.','error');
        $('customerResetPasswordConfirm').focus();
        return;
      }
      let client;
      try{client=getCustomerAuthClient();}
      catch(error){setCustomerAuthMessage(error.message||'The sign-in service is unavailable.','error');return;}
      customerAuthBusy=true;
      const submit=$('customerPasswordRecoverySubmit');
      submit.disabled=true;
      submit.textContent='Updating password…';
      $('customerPasswordRecoveryCancel').disabled=true;
      setCustomerAuthMessage('Updating your GENMERCH password securely…');
      try{
        const result=await client.auth.updateUser({password});
        if(result.error)throw result.error;
        customerAuthRecoveryMode=false;
        $('customerPasswordRecoveryForm').hidden=true;
        $('customerAuthMethods').hidden=false;
        $('customerResetPassword').value='';
        $('customerResetPasswordConfirm').value='';
        try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}
        let session=null;
        try{
          const sessionResult=await client.auth.getSession();
          if(!sessionResult.error&&sessionResult.data)session=sessionResult.data.session||null;
        }catch(_){}
        updateCustomerAuthScreen(session);
        if(session&&session.user){
          closeCustomerAuth();
          showToast('Your GENMERCH password was updated successfully.');
        }else{
          setCustomerAuthMode('signin');
          setCustomerAuthMessage('Your password was updated successfully. Sign in with your new password.','success');
        }
      }catch(error){
        setCustomerAuthMessage(customerAuthFriendlyError(error,'recovery'),'error');
      }finally{
        customerAuthBusy=false;
        submit.disabled=false;
        submit.textContent='Update Password';
        $('customerPasswordRecoveryCancel').disabled=false;
      }
    });
    $('customerGoogleButton').addEventListener('click',async()=>{
      if(customerAuthBusy)return;
      let client;
      try{client=getCustomerAuthClient();}
      catch(error){setCustomerAuthMessage(error.message||'The sign-in service is unavailable.','error');return;}
      customerAuthBusy=true;
      const button=$('customerGoogleButton');
      const passwordSubmit=$('customerPasswordSubmit');
      button.disabled=true;
      passwordSubmit.disabled=true;
      setCustomerAuthMessage('');
      showCenteredActionStatus('Please wait...','loading');
      let redirectStarted=false;
      try{
        const redirectTo=getCustomerAuthRedirectUrl();
        // Take control of the browser redirect so the button cannot start a second
        // OAuth request while the first redirect is still being initiated.
        const {data,error}=await client.auth.signInWithOAuth({
          provider:'google',
          options:{redirectTo,skipBrowserRedirect:true}
        });
        if(error)throw error;
        if(!data||!data.url)throw new Error('Google did not return a sign-in URL. Please try again.');
        try{sessionStorage.setItem(CUSTOMER_GOOGLE_OAUTH_PENDING_KEY,String(Date.now()));}catch(_){}
        redirectStarted=true;
        setCustomerAuthMessage('Redirecting securely to Google…');
        window.location.assign(data.url);
        return;
      }catch(error){
        redirectStarted=false;
        clearCustomerGoogleOAuthPending();
        setCustomerAuthMessage(customerAuthFriendlyError(error,'google'),'error');
      }finally{
        // Keep both buttons disabled until navigation starts. The destination page
        // initializes a fresh UI state after Google returns.
        if(!redirectStarted){
          hideCenteredActionStatus();
          customerAuthBusy=false;
          button.disabled=false;
          passwordSubmit.disabled=false;
        }
      }
    });
    let customerLogoutReturnFocus = null;

    function setCustomerLogoutFeedback(message,type=''){
      const node=$('customerLogoutFeedback');
      if(!node)return;
      node.textContent=message||'';
      node.className='gm-premium-signout-feedback'+(type?' '+type:'');
      node.hidden=!message;
    }
    function openCustomerLogoutConfirmation(){
      if(customerAuthBusy)return;
      const session=customerAuthCurrentSession;
      if(!session||!session.user){
        setCustomerAuthMessage('We could not verify your signed-in session. Please refresh and try again.','error');
        return;
      }
      customerLogoutReturnFocus=document.activeElement;
      $('customerLogoutAccountEmail').textContent=String(session.user.email||'').trim()||'Email unavailable for this session';
      const avatar=$('customerLogoutAvatar');
      if(avatar){
        const storefrontAvatar=$('customerAccountButton')?.querySelector('.gmca-storefront-avatar-image');
        const metadata=session.user.user_metadata||{};
        const candidate=String((storefrontAvatar&&storefrontAvatar.currentSrc)||(storefrontAvatar&&storefrontAvatar.src)||metadata.avatar_url||metadata.picture||'').trim();
        if(candidate){
          try{
            const parsed=new URL(candidate,window.location.href);
            const allowedPrivateAvatar=parsed.protocol==='https:'&&parsed.hostname.endsWith('.supabase.co')&&parsed.pathname.includes('/storage/v1/object/sign/customer-avatars/');
            const allowedProviderAvatar=parsed.protocol==='https:'&&(parsed.hostname==='lh3.googleusercontent.com'||parsed.hostname.endsWith('.googleusercontent.com')||parsed.hostname.endsWith('.fbcdn.net'));
            if(allowedPrivateAvatar||allowedProviderAvatar){
              const image=document.createElement('img');
              image.src=parsed.href;
              image.alt='';
              image.draggable=false;
              image.referrerPolicy='no-referrer';
              avatar.replaceChildren(image);
            }else{
              avatar.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c.7-4.6 3.4-7 8-7s7.3 2.4 8 7"></path></svg>';
            }
          }catch(_){}
        }
      }
      const overlay=$('customerLogoutConfirmOverlay');
      $('customerLogoutCancelButton').disabled=false;
      $('customerLogoutCloseButton').disabled=false;
      $('customerLogoutConfirmButton').disabled=false;
      $('customerLogoutConfirmButton').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg><span>Sign Out</span>';
      setCustomerLogoutFeedback('');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      $('customerLogoutCancelButton').focus();
    }
    function closeCustomerLogoutConfirmation(restoreFocus=true){
      if(customerAuthBusy&&restoreFocus)return;
      const overlay=$('customerLogoutConfirmOverlay');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      if(restoreFocus){
        const trigger=customerLogoutReturnFocus||$('customerAuthSignOut');
        if(trigger&&typeof trigger.focus==='function')trigger.focus();
      }
      customerLogoutReturnFocus=null;
      if(!$('customerAuthOverlay').classList.contains('open')&&!$('customerLogoutSuccessOverlay').classList.contains('open')&&!$('customerOrdersOverlay').classList.contains('open')&&!$('cartModal').classList.contains('open')&&!$('productOverlay').classList.contains('open')){
        document.body.style.overflow='';
      }
    }
    function openCustomerLogoutSuccess(){
      const overlay=$('customerLogoutSuccessOverlay');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
      $('customerLogoutSuccessContinueButton').focus();
    }
    function closeCustomerLogoutSuccess(restoreFocus=true){
      const overlay=$('customerLogoutSuccessOverlay');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      if(!$('cartModal').classList.contains('open')&&!$('productOverlay').classList.contains('open')&&!$('customerAuthOverlay').classList.contains('open')){
        document.body.style.overflow='';
      }
      if(restoreFocus){
        const trigger=$('customerAccountButton');
        if(trigger&&typeof trigger.focus==='function')trigger.focus();
      }
    }
    async function performCustomerSignOut(){
      if(customerAuthBusy)return;
      const session=customerAuthCurrentSession;
      if(!session||!session.user){
        setCustomerLogoutFeedback('We could not verify your signed-in session. Please refresh and try again.','error');
        return;
      }
      const button=$('customerAuthSignOut');
      const confirmButton=$('customerLogoutConfirmButton');
      const cancelButton=$('customerLogoutCancelButton');
      const closeButton=$('customerLogoutCloseButton');
      customerAuthBusy=true;
      if(button){button.disabled=true;button.textContent='Signing Out…';}
      confirmButton.disabled=true;
      confirmButton.innerHTML='<span>Signing out…</span>';
      cancelButton.disabled=true;
      closeButton.disabled=true;
      $('customerLogoutConfirmOverlay').setAttribute('aria-busy','true');
      setCustomerLogoutFeedback('Signing you out securely…','success');
      try{
        const client=getCustomerAuthClient();
        const {error}=await client.auth.signOut();
        if(error)throw error;
        closeCustomerLogoutConfirmation(false);
        updateCustomerAuthScreen(null);
        $('customerPassword').value='';
        $('customerFullName').value='';
        setCustomerAuthMode('signin');
        closeCustomerAuth();
        openCustomerLogoutSuccess();
      }catch(error){
        console.error('GENMERCH could not complete customer sign out.',error);
        setCustomerLogoutFeedback('We couldn’t complete your sign out right now. Your account may still be signed in; please try again.','error');
      }finally{
        customerAuthBusy=false;
        $('customerLogoutConfirmOverlay').removeAttribute('aria-busy');
        if(button){button.disabled=false;button.textContent='Log Out';}
        cancelButton.disabled=false;
        closeButton.disabled=false;
        confirmButton.disabled=false;
        confirmButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg><span>Sign Out</span>';
      }
    }
    $('customerAuthSignOut').addEventListener('click',openCustomerLogoutConfirmation);
    $('customerLogoutCloseButton').addEventListener('click',()=>closeCustomerLogoutConfirmation());
    $('customerLogoutCancelButton').addEventListener('click',()=>closeCustomerLogoutConfirmation());
    $('customerLogoutConfirmButton').addEventListener('click',()=>performCustomerSignOut());
    $('customerLogoutConfirmOverlay').addEventListener('click',event=>{
      if(event.target===$('customerLogoutConfirmOverlay')){event.preventDefault();event.stopPropagation();}
    });
    document.addEventListener('keydown',event=>{
      const confirmOverlay=$('customerLogoutConfirmOverlay');
      if(event.key==='Escape'&&confirmOverlay.classList.contains('open')){
        event.preventDefault();
        event.stopPropagation();
        closeCustomerLogoutConfirmation();
      }else if(event.key==='Tab'&&confirmOverlay.classList.contains('open')){
        const dialog=confirmOverlay.querySelector('.customer-logout-confirm-modal');
        const focusable=dialog?Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')):[];
        if(!focusable.length){event.preventDefault();dialog&&dialog.focus();return;}
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }else if(event.key==='Escape'&&$('customerLogoutSuccessOverlay').classList.contains('open')){
        event.preventDefault();
        event.stopPropagation();
        closeCustomerLogoutSuccess();
      }
    });
    $('customerLogoutSuccessContinueButton').addEventListener('click',()=>closeCustomerLogoutSuccess());
    $('customerLogoutSuccessSignInButton').addEventListener('click',()=>{
      closeCustomerLogoutSuccess(false);
      setCustomerAuthMode('signin');
      openCustomerAuth();
    });
    $('customerLogoutSuccessOverlay').addEventListener('click',event=>{
      if(event.target===$('customerLogoutSuccessOverlay')){event.preventDefault();event.stopPropagation();}
    });
    function initializeCustomerAuth(){
      const callbackAtStart=isCustomerAuthCallbackUrl();
      const recoveryCallbackAtStart=isCustomerPasswordRecoveryCallbackUrl();
      const callbackParams=new URLSearchParams(window.location.search);
      const callbackError=callbackParams.get('error_description')||callbackParams.get('error')||'';
      try{
        const client=getCustomerAuthClient();
        client.auth.getSession().then(({data,error})=>{
          if(error)throw error;
          const session=data&&data.session?data.session:null;
          updateCustomerAuthScreen(session);
          if(recoveryCallbackAtStart&&session){
            clearCustomerGoogleOAuthPending();
            window.setTimeout(()=>openCustomerPasswordRecovery('Your reset link is verified. Choose a new password.','success'),0);
            try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}
          }else if(callbackAtStart&&session){
            clearCustomerGoogleOAuthPending();
            // The SIGNED_IN auth event shows the success toast and clears callback parameters.
            try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}
          }else if(callbackAtStart&&!session){
            clearCustomerGoogleOAuthPending();
            const message=callbackError
              ?'Google sign-in was not completed: '+callbackError
              :'Google returned to GENMERCH, but the sign-in session was not created. Please tap Continue using Google account once and wait for the redirect to finish.';
            showCustomerGoogleOAuthError(message);
            try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}
          }else if(!session&&hasPendingCustomerGoogleOAuth()){
            clearCustomerGoogleOAuthPending();
            showCustomerGoogleOAuthError('Google sign-in did not finish on the previous attempt. Please tap Continue using Google account once and wait for it to return to GENMERCH.');
          }else if(session){
            clearCustomerGoogleOAuthPending();
          }
        }).catch(error=>{
          console.warn('Customer authentication session could not be restored.',error);
          if(callbackAtStart||hasPendingCustomerGoogleOAuth()){
            clearCustomerGoogleOAuthPending();
            showCustomerGoogleOAuthError('We could not finish Google sign-in. '+customerAuthFriendlyError(error,'google')+' Please try again.');
            if(callbackAtStart){try{window.history.replaceState({},document.title,getCustomerAuthRedirectUrl());}catch(_){}}
          }
        });
      }catch(error){
        console.warn('Supabase Auth SDK is not available until sign-in is requested.',error);
        if(hasPendingCustomerGoogleOAuth()){
          clearCustomerGoogleOAuthPending();
          showCustomerGoogleOAuthError(error.message||'The sign-in service is unavailable. Please try again.');
        }
      }
    }
    setCustomerAuthMode('signin');
    initializeCustomerAuth();

    // GENMERCH Seller Centre. Passcode is a convenience gate; Supabase RLS is the security boundary.
    const GENMERCH_SELLER_PASSCODE = '121793';
    let sellerCentreIsUnlocked = false;
    const SELLER_CENTRE_SESSION_KEY = 'genmerchSellerCentreAdminUserId';
    // Session-scoped UI state: survives hard refresh in each open tab, but is cleared by Exit/Log Out.
    const SELLER_CENTRE_VIEW_STATE_KEY = 'genmerchSellerCentreViewState';
    const SELLER_CENTRE_TAB_STATE_KEY = 'genmerchSellerCentreActiveTab';
    const SELLER_CENTRE_ALLOWED_TABS = new Set(['products','deleted','orders','inventory','movements']);
    // Explicit email allowlist: only these two addresses may use Seller Centre.
    // Supabase app_metadata.role must also be "admin"; email alone never grants access.
    const GENMERCH_SELLER_ADMIN_EMAILS = new Set([
      'negosyonipinoy@gmail.com',
      'jelsonroqueza@gmail.com'
    ]);
    function isAuthorizedSellerAdmin(user){
      const email=String(user&&user.email||'').trim().toLowerCase();
      return GENMERCH_SELLER_ADMIN_EMAILS.has(email)&&String(user&&user.app_metadata&&user.app_metadata.role||'').toLowerCase()==='admin';
    }
    let sellerCurrentTab = 'products';
    let sellerCategories = [];
    let sellerOrdersLoaded = false;
    let sellerOrdersRefreshTimer = null;
    let sellerOrdersRealtimeChannel = null;
    let sellerOrdersRealtimeClient = null;
    let sellerOrdersRealtimeStatus = 'idle';
    let sellerOrdersRealtimeSetupPromise = null;
    let sellerOrdersRealtimeRefreshTimer = null;
    let sellerOrdersRealtimeHasSubscribed = false;
    let sellerOrdersVisibilityListenerBound = false;
    let sellerOrderFilterSourceRows = [];
    let sellerOrderFilterSourceItems = [];
    let sellerOrderFilterSourceShipments = [];
    let sellerOrdersCurrentPage = 1;
    let sellerOrdersSortKey = 'created_at';
    let sellerOrdersSortDirection = 'desc';
    let sellerInventorySortKey = 'product';
    let sellerInventorySortDirection = 'asc';
    const SELLER_TABLE_PAGE_SIZE = 10;
    let sellerInventoryLoaded = false;
    let sellerInventoryRows = [];
    let sellerMovementRows = [];
    let sellerExportXlsxLoadingPromise = null;
    let sellerEditingProductId = null;
    let sellerEditingProductSku = '';
    let sellerEditingVariants = [];
    let sellerSelectedSizes = new Set();
    let sellerEditingImages = [];
    let sellerProductRowsById = new Map();
    let sellerActiveProductRows = [];
    let sellerProductCategoryMap = new Map();
    let sellerProductImageMap = new Map();
    let sellerProductVariantMap = new Map();
    let sellerPendingPermanentDeleteProductId = '';
    let sellerPermanentDeleteBusy = false;
    let sellerPermanentDeleteReturnFocus = null;
    let sellerImageRowsByProductId = new Map();
    let sellerPreviewObjectUrls = [];
    const SELLER_IMAGE_INPUT_IDS = ['sellerImageFile1','sellerImageFile2','sellerImageFile3','sellerImageFile4','sellerImageFile5','sellerImageFile6','sellerImageFile7','sellerImageFile8','sellerImageFile9','sellerImageFile10','sellerImageFile11','sellerImageFile12','sellerImageFile13','sellerImageFile14','sellerImageFile15','sellerImageFile16','sellerImageFile17','sellerImageFile18','sellerImageFile19','sellerImageFile20','sellerImageFile21','sellerImageFile22','sellerImageFile23','sellerImageFile24','sellerImageFile25','sellerImageFile26','sellerImageFile27','sellerImageFile28','sellerImageFile29','sellerImageFile30'];
    const SELLER_IMAGE_BUCKET = 'product-images';
    const SELLER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
    const SELLER_IMAGE_MAX_COUNT = 30;
    const SELLER_IMAGE_TYPES = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    function sellerEscape(value){return String(value===null||value===undefined?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function sellerFeedback(id,message,type){const node=$(id);if(!node)return;node.textContent=message||'';node.className='seller-feedback'+(type?' '+type:'');node.hidden=!message;}
    function sellerShowOverlay(id){const node=$(id);if(!node)return;node.classList.add('open');node.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
    function sellerHideOverlay(id){const node=$(id);if(!node)return;node.classList.remove('open');node.setAttribute('aria-hidden','true');if(!document.querySelector('.seller-modal-overlay.open')&&!$('cartModal').classList.contains('open')&&!$('productOverlay').classList.contains('open')&&!$('noticeOverlay').classList.contains('open')&&!$('customerAuthOverlay').classList.contains('open'))document.body.style.overflow='';}
    function sellerGetRememberedAdminId(){
      try{return localStorage.getItem(SELLER_CENTRE_SESSION_KEY)||'';}catch(_){return '';}
    }
    function sellerRememberAdminId(userId){
      try{if(userId)localStorage.setItem(SELLER_CENTRE_SESSION_KEY,String(userId));else localStorage.removeItem(SELLER_CENTRE_SESSION_KEY);}catch(error){console.warn('Seller Centre sign-in could not be persisted in this browser.',error);}
    }
    function sellerRememberViewState(isOpen){
      try{
        if(isOpen)sessionStorage.setItem(SELLER_CENTRE_VIEW_STATE_KEY,'open');
        else{sessionStorage.removeItem(SELLER_CENTRE_VIEW_STATE_KEY);sessionStorage.removeItem(SELLER_CENTRE_TAB_STATE_KEY);}
      }catch(error){console.warn('Seller Centre page state could not be saved in this tab.',error);}
    }
    function sellerWasOpenBeforeRefresh(){try{return sessionStorage.getItem(SELLER_CENTRE_VIEW_STATE_KEY)==='open';}catch(_){return false;}}
    function sellerGetRememberedTab(){try{const tab=sessionStorage.getItem(SELLER_CENTRE_TAB_STATE_KEY)||'products';return SELLER_CENTRE_ALLOWED_TABS.has(tab)?tab:'products';}catch(_){return 'products';}}
    async function restoreSellerCentreAfterRefresh(){
      if(!sellerWasOpenBeforeRefresh())return false;
      const rememberedId=sellerGetRememberedAdminId();
      if(!rememberedId){sellerRememberViewState(false);return false;}
      try{
        const client=getCustomerAuthClient();
        const sessionResult=await client.auth.getSession();
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session;
        if(!session||!session.user){sellerRememberAdminId('');sellerRememberViewState(false);return false;}
        if(String(session.user.id)!==String(rememberedId)||!isAuthorizedSellerAdmin(session.user)){
          sellerRememberAdminId('');sellerRememberViewState(false);return false;
        }
        // Verify against Supabase before re-opening the admin portal; a saved UI flag never grants access.
        const userResult=await client.auth.getUser();
        if(userResult.error){console.warn('Seller Centre restore is waiting for Supabase session verification.',userResult.error);return false;}
        const user=userResult.data&&userResult.data.user;
        if(!user||String(user.id)!==String(rememberedId)||!isAuthorizedSellerAdmin(user)){
          sellerRememberAdminId('');sellerRememberViewState(false);return false;
        }
        sellerCentreIsUnlocked=true;sellerOrdersLoaded=false;sellerInventoryLoaded=false;
        sellerShowOverlay('sellerDashboardOverlay');
        switchSellerTab(sellerGetRememberedTab());
        await loadSellerProducts();
        return true;
      }catch(error){
        // Preserve the intent if session verification is temporarily unavailable; retry on the next refresh.
        console.warn('Seller Centre could not be restored yet. The saved tab state has been kept.',error);
        return false;
      }
    }
    async function openSellerCentre(){
      sellerFeedback('sellerPasscodeFeedback','','');
      $('sellerPasscodeInput').value='';
      const rememberedId=sellerGetRememberedAdminId();
      if(rememberedId){
        try{
          const client=await getSellerAdminClient();
          const {data,error}=await client.auth.getUser();
          if(error)throw error;
          const user=data&&data.user;
          if(user&&user.id===rememberedId&&isAuthorizedSellerAdmin(user)){
            sellerCentreIsUnlocked=true;
            sellerOrdersLoaded=false;
            sellerInventoryLoaded=false;
            sellerRememberViewState(true);
            sellerShowOverlay('sellerDashboardOverlay');
            switchSellerTab(sellerGetRememberedTab());
            await loadSellerProducts();
            return;
          }
          sellerRememberAdminId('');
        }catch(error){
          sellerRememberAdminId('');
          console.warn('Seller Centre remembered session requires fresh verification.',error);
        }
      }
      sellerShowOverlay('sellerPasscodeOverlay');
      window.setTimeout(()=>$('sellerPasscodeInput').focus(),30);
    }
    function closeSellerPasscode(){sellerHideOverlay('sellerPasscodeOverlay');$('sellerPasscodeInput').value='';}
    function closeSellerDashboard(){sellerCentreIsUnlocked=false;stopSellerOrdersAutoRefresh();sellerRememberViewState(false);sellerHideOverlay('sellerDashboardOverlay');}
    function logoutSellerCentre(){
      sellerRememberAdminId('');
      sellerCentreIsUnlocked=false;
      sellerOrdersLoaded=false;
      sellerInventoryLoaded=false;
      closeSellerDashboard();
      sellerFeedback('sellerPasscodeFeedback','','');
      showToast('You have logged out of Seller Centre. Enter the passcode again next time.');
    }

    function sellerIsBrokenRefreshSessionError(error){
      const message=String(error&&error.message||'');
      const code=String(error&&error.code||'');
      return /refresh.?token.*(not found|invalid)|invalid refresh token|refresh_token_not_found|invalid jwt|jwt expired|token is expired/i.test(message+' '+code);
    }
    async function sellerClearBrokenLocalSession(client){
      try{
        if(client&&client.auth&&typeof client.auth.signOut==='function'){
          await client.auth.signOut({scope:'local'});
        }
      }catch(cleanupError){
        console.warn('GENMERCH could not clear the expired local Seller Centre session automatically.',cleanupError);
      }
      sellerRememberAdminId('');
      sellerRememberViewState(false);
    }
    async function getSellerAdminClient(){
      const client=getCustomerAuthClient();
      let result;
      try{
        result=await client.auth.getSession();
      }catch(error){
        if(sellerIsBrokenRefreshSessionError(error)){
          await sellerClearBrokenLocalSession(client);
          throw new Error('Your saved GENMERCH sign-in session is no longer valid. Please sign in again using the Account button, then reopen Seller Centre.');
        }
        throw error;
      }
      if(result.error){
        if(sellerIsBrokenRefreshSessionError(result.error)){
          await sellerClearBrokenLocalSession(client);
          throw new Error('Your saved GENMERCH sign-in session is no longer valid. Please sign in again using the Account button, then reopen Seller Centre.');
        }
        throw result.error;
      }
      const session=result.data&&result.data.session;
      if(!session||!session.user)throw new Error('Please sign in first using the Account button with the authorized Seller Centre admin account.');
      if(!isAuthorizedSellerAdmin(session.user))throw new Error('This Supabase account is not one of the two authorized Seller Centre admin accounts.');
      return client;
    }
    async function verifySellerPasscode(event){
      event.preventDefault();const input=$('sellerPasscodeInput'),submit=$('sellerPasscodeSubmit');
      if(String(input.value||'').trim()!==GENMERCH_SELLER_PASSCODE){sellerFeedback('sellerPasscodeFeedback','Incorrect passcode. Please try again.','error');input.value='';input.focus();return;}
      submit.disabled=true;submit.textContent='Verifying…';sellerFeedback('sellerPasscodeFeedback','Checking your Supabase admin session…','');
      try{
        const client=await getSellerAdminClient();
        const {data,error}=await client.auth.getUser();
        if(error){
          if(sellerIsBrokenRefreshSessionError(error)){
            await sellerClearBrokenLocalSession(client);
            throw new Error('Your saved GENMERCH sign-in session is no longer valid. Please sign in again using the Account button, then reopen Seller Centre.');
          }
          throw error;
        }
        const user=data&&data.user;
        if(!user||!isAuthorizedSellerAdmin(user))throw new Error('This Supabase account is not one of the two authorized Seller Centre admin accounts.');
        sellerRememberAdminId(user.id);
        sellerCentreIsUnlocked=true;sellerOrdersLoaded=false;sellerInventoryLoaded=false;
        sellerRememberViewState(true);
        closeSellerPasscode();sellerShowOverlay('sellerDashboardOverlay');switchSellerTab('products');await loadSellerProducts();
      }
      catch(error){
        const message=error&&error.message?error.message:'Could not verify Seller Centre access.';
        if(/sign in first|sign in again/i.test(message)){
          closeSellerPasscode();
          openCustomerAuth();
          showToast(message);
        }else{
          sellerFeedback('sellerPasscodeFeedback',message,'error');
          input.value='';
          input.focus();
        }
      }
      finally{submit.disabled=false;submit.textContent='Unlock Seller Centre';}
    }
    function sellerSetLoadingRow(id,columns,message){const tbody=$(id);if(tbody)tbody.innerHTML='<tr><td colspan="'+columns+'" class="seller-table-empty">'+sellerEscape(message)+'</td></tr>';}
    function sellerSlugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'product';}
    function sellerRandomSuffix(){return Math.random().toString(36).slice(2,7).toUpperCase()+Date.now().toString(36).slice(-3).toUpperCase();}
    function sellerMakeSku(name,suffix){const stem=sellerSlugify(name).replace(/-/g,'').slice(0,10).toUpperCase()||'ITEM';return 'GM-'+stem+'-'+suffix;}
    const SELLER_SIZE_OPTIONS = ['Small','Medium','Large','Free Size','Extra Size'];
    function sellerSizeOptionsForCategory(categoryName){return /\b(cap|caps|bag|bags)\b/i.test(String(categoryName||''))?['Free Size']:SELLER_SIZE_OPTIONS.slice();}
    function sellerGetSelectedSizes(){return Array.from($('sellerSizeOptions').querySelectorAll('[data-seller-size]:checked')).map(input=>input.value);}
    function sellerUpdateSizeCount(){const sizes=sellerGetSelectedSizes(),count=$('sellerSizeCount');count.textContent=sizes.length?sizes.length+' available size(s): '+sizes.join(', '):'Choose at least one available size.';count.classList.toggle('seller-size-count-error',sizes.length===0);return sizes;}
    function sellerRenderSizeOptions(categoryName,selectedSizes){
      const container=$('sellerSizeOptions'),options=sellerSizeOptionsForCategory(categoryName),selected=new Set(selectedSizes||[]);
      if(!categoryName){container.innerHTML='<span class="seller-gallery-empty">Choose a category to select sizes.</span>';$('sellerSizeCount').textContent='Choose at least one available size.';return;}
      container.innerHTML=options.map(size=>'<label class="seller-size-choice"><input type="checkbox" data-seller-size value="'+sellerEscape(size)+'" '+(selected.has(size)?'checked':'')+'><span>'+sellerEscape(size)+'</span></label>').join('');
      container.querySelectorAll('[data-seller-size]').forEach(input=>input.addEventListener('change',sellerUpdateSizeCount));
      sellerUpdateSizeCount();
    }
    function sellerHandleCategoryChange(){
      const category=(sellerCategories.find(item=>String(item.id)===$('sellerProductCategory').value)||{}).name||'';
      sellerSelectedSizes=new Set(sellerSizeOptionsForCategory(category));
      sellerRenderSizeOptions(category,sellerSelectedSizes);
    }
    function sellerNormalizeColorLabel(value){return String(value||'').trim().replace(/\s+/g,' ').toUpperCase().slice(0,60);}
    function sellerUniqueColorLabels(values){return Array.from(new Set((values||[]).map(sellerNormalizeColorLabel).filter(Boolean)));}
    function sellerVariantRows(productId,sku,categoryName,selectedSizes,desiredColors){
      const sizes=sellerSizeOptionsForCategory(categoryName).filter(size=>(selectedSizes||[]).includes(size));
      const colors=sellerUniqueColorLabels(desiredColors||[]),colorValues=colors.length?colors:[null],rows=[];
      sizes.forEach(size=>colorValues.forEach(color=>{
        const colorCode=color?sellerSlugify(color).replace(/-/g,'').toUpperCase().slice(0,8):'';
        const sizeCode=size.replace(/[^A-Za-z0-9]+/g,'').toUpperCase().slice(0,8);
        rows.push({product_id:productId,sku:String(sku||sellerMakeSku('PRODUCT',sellerRandomSuffix()))+'-'+(colorCode?colorCode+'-':'')+sizeCode+'-'+sellerRandomSuffix(),size_label:size,color_label:color,price_override:null,stock_quantity:0,is_active:true});
      }));
      return rows;
    }
    async function sellerApplySelectedSizes(client,productId,productSku,categoryName,selectedSizes,desiredColors=null){
      const allowed=sellerSizeOptionsForCategory(categoryName),selected=new Set((selectedSizes||[]).filter(size=>allowed.includes(size)));
      if(!selected.size)throw new Error('Select at least one available clothing size.');
      const loaded=await client.from('product_variants').select('id,sku,size_label,color_label,price_override,stock_quantity,is_active').eq('product_id',productId);
      if(loaded.error)throw loaded.error;
      const variants=loaded.data||[];
      const existingColors=sellerUniqueColorLabels(variants.map(row=>row.color_label));
      const colors=desiredColors===null?(existingColors.length?existingColors:[]):sellerUniqueColorLabels(desiredColors);
      const colorValues=colors.length?colors:[null];
      const colorMatches=(row,color)=>sellerNormalizeColorLabel(row.color_label)===sellerNormalizeColorLabel(color);
      const pairKey=(size,color)=>JSON.stringify([String(size),sellerNormalizeColorLabel(color)]);
      const existingPairs=new Set(variants.map(row=>pairKey(row.size_label,row.color_label)));
      for(const variant of variants){
        const enable=allowed.includes(variant.size_label)&&selected.has(variant.size_label)&&colorValues.some(color=>colorMatches(variant,color));
        if(Boolean(variant.is_active)!==enable){const changed=await client.from('product_variants').update({is_active:enable}).eq('id',variant.id);if(changed.error)throw changed.error;}
      }
      const missingPairs=[];
      selected.forEach(size=>colorValues.forEach(color=>{
        if(!existingPairs.has(pairKey(size,color)))missingPairs.push({size,color});
      }));
      if(missingPairs.length){
        const rows=[];
        missingPairs.forEach(({size,color})=>{
          const colorCode=color?sellerSlugify(color).replace(/-/g,'').toUpperCase().slice(0,8):'';
          const sizeCode=size.replace(/[^A-Za-z0-9]+/g,'').toUpperCase().slice(0,8);
          rows.push({product_id:productId,sku:String(productSku||sellerMakeSku('PRODUCT',sellerRandomSuffix()))+'-'+(colorCode?colorCode+'-':'')+sizeCode+'-'+sellerRandomSuffix(),size_label:size,color_label:color,price_override:null,stock_quantity:0,is_active:true});
        });
        const inserted=await client.from('product_variants').insert(rows);if(inserted.error)throw inserted.error;
      }
    }
    function sellerSetCategoryOptions(categories){const select=$('sellerProductCategory'),previous=select.value;select.innerHTML='<option value="">Choose a category</option>'+categories.map(item=>'<option value="'+sellerEscape(item.id)+'">'+sellerEscape(item.name||'Unnamed category')+'</option>').join('');if(categories.some(item=>String(item.id)===previous))select.value=previous;}
    async function sellerAddCustomCategory(){if(!sellerCentreIsUnlocked)return;const input=$('sellerCustomCategoryName'),name=String(input.value||'').trim();if(name.length<2||name.length>80){sellerFeedback('sellerProductFeedback','Enter a custom category name between 2 and 80 characters.','error');input.focus();return;}const button=$('sellerAddCustomCategoryButton');button.disabled=true;button.textContent='Saving…';try{const client=await getSellerAdminClient(),slug=sellerSlugify(name);if(!slug)throw new Error('Use letters or numbers for the category name.');const existing=sellerCategories.find(row=>String(row.name||'').trim().toLowerCase()===name.toLowerCase());if(existing){$('sellerProductCategory').value=existing.id;input.value='';sellerHandleCategoryChange();sellerFeedback('sellerProductFeedback','That category already exists. It has been selected.','success');return;}const result=await client.from('categories').insert({name,slug,description:'Custom category created in Seller Centre',is_active:true,sort_order:sellerCategories.length+1}).select('id,name,slug,is_active,sort_order').single();if(result.error)throw result.error;sellerCategories.push(result.data);sellerSetCategoryOptions(sellerCategories);$('sellerProductCategory').value=result.data.id;input.value='';sellerHandleCategoryChange();sellerFeedback('sellerProductFeedback','Custom category “'+name+'” saved to Supabase and selected.','success');}catch(error){sellerFeedback('sellerProductFeedback',error.message||'Could not create category. Check category permissions.','error');}finally{button.disabled=false;button.textContent='＋ Add Custom';}}
    function sellerUpdatePromotionPreview(){const type=String($('sellerPromotionType')?.value||'none'),price=Number($('sellerSellingPrice')?.value||0),node=$('sellerPromotionPreview');if(!node)return;if(type==='percent'){const percent=Number($('sellerPromotionType').value),sale=Math.round(price*(1-percent/100)*100)/100;node.textContent=price>0?'Customer price: '+money(sale)+' (save '+money(price-sale)+', '+percent+'% OFF).':'Enter a regular price to preview the discount.';}else if(type==='free_shipping_metro')node.textContent='Free Shipping for Metro Manila only. Verify the delivery zone at checkout.';else if(type==='free_delivery_metro')node.textContent='Free Delivery for Metro Manila only. Verify the delivery zone at checkout.';else node.textContent='No promotional discount will be applied.';}

    async function loadSellerProducts(){
      if(!sellerCentreIsUnlocked)return;
      sellerSetLoadingRow('sellerProductsTableBody',6,'Loading products from Supabase…');
      sellerFeedback('sellerProductsFeedback','','');
      try{
        const client=await getSellerAdminClient();
        const results=await Promise.all([
          client.from('categories').select('id,name,slug,is_active,sort_order').eq('is_active',true).order('sort_order',{ascending:true}),
          client.from('products').select('id,category_id,name,slug,sku,description,base_price,compare_at_price,regular_price,promotion_type,promotion_value,is_active,is_deleted,deleted_at,is_demo,is_featured,location,created_at').order('created_at',{ascending:false}).limit(500),
          client.from('product_images').select('id,product_id,image_url,alt_text,sort_order,is_primary,color_label,created_at').order('sort_order',{ascending:true}),
          client.from('product_variants').select('id,product_id,size_label,color_label,stock_quantity,is_active')
        ]);
        for(const item of results)if(item.error)throw item.error;
        sellerCategories=results[0].data||[];sellerSetCategoryOptions(sellerCategories);
        const productRows=results[1].data||[],imageRows=results[2].data||[];
        const categoryMap=new Map(sellerCategories.map(item=>[String(item.id),item.name||'Other']));
        const imageMap=new Map(),variantMap=new Map();
        sellerProductRowsById=new Map(productRows.map(item=>[String(item.id),item]));
        sellerImageRowsByProductId=new Map();
        imageRows.forEach(item=>{const key=String(item.product_id);if(!imageMap.has(key))imageMap.set(key,[]);imageMap.get(key).push(item);});
        imageMap.forEach((rows,key)=>sellerImageRowsByProductId.set(key,rows.slice().sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0))));
        (results[3].data||[]).forEach(item=>{const key=String(item.product_id);if(!variantMap.has(key))variantMap.set(key,[]);variantMap.get(key).push(item);});
        const activeProductRows=productRows.filter(item=>item.is_deleted!==true);
        const deletedProductRows=productRows.filter(item=>item.is_deleted===true);
        sellerActiveProductRows=activeProductRows;
        sellerProductCategoryMap=categoryMap;
        sellerProductImageMap=imageMap;
        sellerProductVariantMap=variantMap;
        sellerPopulateProductFilterCategories();
        sellerApplyProductFilters();
        renderSellerDeletedProducts(deletedProductRows,categoryMap,imageMap,variantMap);
        $('sellerDeletedCount').textContent=String(deletedProductRows.length);
        $('sellerDeletedCount').hidden=deletedProductRows.length===0;
        if(!sellerCategories.length)sellerFeedback('sellerProductsFeedback','No active categories were returned. Activate a category in Supabase before adding products.','error');
      }catch(error){
        sellerSetLoadingRow('sellerProductsTableBody',6,'Product data could not be loaded.');
        sellerSetLoadingRow('sellerDeletedProductsTableBody',6,'Deleted products could not be loaded.');
        sellerFeedback('sellerProductsFeedback',error.message||'Could not load products. Check the Supabase admin policies.','error');
        sellerFeedback('sellerDeletedFeedback',error.message||'Could not load deleted products. Check the Supabase admin policies.','error');
      }
    }
    function sellerPopulateProductFilterCategories(){
      const select=$('sellerProductsCategoryFilter');
      if(!select)return;
      const previous=select.value;
      const categories=new Map();
      sellerActiveProductRows.forEach(product=>{
        const id=String(product.category_id||'');
        const label=sellerProductCategoryMap.get(id)||'Other';
        const key=id||'__uncategorized__';
        if(!categories.has(key))categories.set(key,label);
      });
      const sorted=Array.from(categories.entries()).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'en',{sensitivity:'base'}));
      select.innerHTML='<option value="">All categories</option>'+sorted.map(([id,label])=>'<option value="'+sellerEscape(id)+'">'+sellerEscape(label)+'</option>').join('');
      if(sorted.some(([id])=>id===previous))select.value=previous;
    }
    function sellerApplyProductFilters(){
      const tbody=$('sellerProductsTableBody');
      if(!tbody)return;
      const query=String($('sellerProductsSearch')?.value||'').trim().toLowerCase();
      const category=String($('sellerProductsCategoryFilter')?.value||'');
      const status=String($('sellerProductsStatusFilter')?.value||'');
      const stockFilter=String($('sellerProductsStockFilter')?.value||'');
      const rows=sellerActiveProductRows.filter(product=>{
        const productId=String(product.id);
        const categoryId=String(product.category_id||'');
        const categoryLabel=sellerProductCategoryMap.get(categoryId)||'Other';
        if(category){
          const key=categoryId||'__uncategorized__';
          if(key!==category)return false;
        }
        if(status==='active'&&product.is_active!==true)return false;
        if(status==='inactive'&&product.is_active===true)return false;
        const variants=sellerProductVariantMap.get(productId)||[];
        const activeVariants=variants.filter(row=>row.is_active!==false);
        const stock=activeVariants.reduce((total,row)=>total+Math.max(0,Math.floor(Number(row.stock_quantity)||0)),0);
        if(stockFilter==='in_stock'&&stock<=5)return false;
        if(stockFilter==='low_stock'&&(stock<1||stock>5))return false;
        if(stockFilter==='out_of_stock'&&stock>0)return false;
        if(query){
          const haystack=[product.name,product.sku,categoryLabel].map(value=>String(value||'').toLowerCase()).join(' ');
          if(!haystack.includes(query))return false;
        }
        return true;
      });
      renderSellerProducts(rows,sellerProductCategoryMap,sellerProductImageMap,sellerProductVariantMap);
      const resultCount=$('sellerProductsFilterResultCount');
      if(resultCount){
        resultCount.textContent='Showing '+rows.length+' of '+sellerActiveProductRows.length+' products';
      }
    }
    function renderSellerProducts(rows,categoryMap,imageMap,variantMap){
      const tbody=$('sellerProductsTableBody');
      if(!rows.length){
        const hasFilters=Boolean(String($('sellerProductsSearch')?.value||'').trim()||$('sellerProductsCategoryFilter')?.value||$('sellerProductsStatusFilter')?.value||$('sellerProductsStockFilter')?.value);
        const emptyMessage=hasFilters?'No products match your filters. Select Clear to view all products.':'No products found in cloud inventory.';
        tbody.innerHTML='<tr><td colspan="6" class="seller-table-empty">'+emptyMessage+'</td></tr>';
        return;
      }
      tbody.innerHTML=rows.map(product=>{
        const id=String(product.id),images=(imageMap.get(id)||[]).slice().sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
        const image=images[0]?safeCatalogImageUrl(images[0].image_url):'',variants=variantMap.get(id)||[],activeVariants=variants.filter(row=>row.is_active!==false);
        const stock=activeVariants.reduce((total,row)=>total+Math.max(0,Math.floor(Number(row.stock_quantity)||0)),0),category=categoryMap.get(String(product.category_id))||'Other';
        const status=product.is_active?'<span class="seller-status-pill">Active</span>':'<span class="seller-status-pill inactive">Inactive</span>';
        const imageAlt=(product.name||'Product')+' photo';
        const thumb=image?'<button class="seller-product-image-button" type="button" data-genmerch-seller-image-viewer="true" data-image-url="'+sellerEscape(image)+'" data-image-alt="'+sellerEscape(imageAlt)+'" aria-label="Open larger image: '+sellerEscape(imageAlt)+'" title="Click to view larger image"><img class="seller-product-thumb" src="'+sellerEscape(image)+'" alt="'+sellerEscape(imageAlt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>':'<div class="seller-product-thumb" aria-hidden="true" style="display:grid;place-items:center">👕</div>';
        const edit='<button class="seller-secondary-button seller-edit-button" type="button" data-seller-product-action="edit" data-product-id="'+sellerEscape(id)+'">✎ Edit</button>';
        const toggle='<button class="seller-danger-button" type="button" data-seller-product-action="delete" data-product-id="'+sellerEscape(id)+'">Delete</button>';
        return '<tr><td><div class="seller-product-cell">'+thumb+'<div><div class="seller-product-name">'+sellerEscape(product.name||'Unnamed product')+'</div><div class="seller-muted">SKU: '+sellerEscape(product.sku||'—')+'</div><div class="seller-muted">'+images.length+'/5 photos</div></div></div></td><td>'+sellerEscape(category)+'</td><td><strong>'+sellerEscape(money(product.base_price))+'</strong>'+(Number(product.compare_at_price)>0?'<div class="seller-muted">Original: '+sellerEscape(money(product.compare_at_price))+'</div>':'')+'</td><td>'+activeVariants.length+' active size(s)<div class="seller-muted">Stock total: '+stock+'</div></td><td>'+status+(product.is_demo?'<div class="seller-muted">Demo product</div>':'')+'</td><td><div class="seller-row-actions">'+edit+toggle+'</div></td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-seller-product-action]').forEach(button=>button.addEventListener('click',()=>{
        const id=button.dataset.productId,action=button.dataset.sellerProductAction;
        if(action==='edit')openSellerProductEditor(id);else handleSellerProductAction(id,action);
      }));
    }
    function renderSellerDeletedProducts(rows,categoryMap,imageMap,variantMap){
      const tbody=$('sellerDeletedProductsTableBody');
      if(!rows.length){tbody.innerHTML='<tr><td colspan="6" class="seller-table-empty">No deleted products. Products you delete will appear here for recovery.</td></tr>';return;}
      tbody.innerHTML=rows.map(product=>{
        const id=String(product.id),images=(imageMap.get(id)||[]).slice().sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
        const image=images[0]?safeCatalogImageUrl(images[0].image_url):'';
        const imageAlt=(product.name||'Product')+' photo';
        const thumb=image?'<button class="seller-product-image-button" type="button" data-genmerch-seller-image-viewer="true" data-image-url="'+sellerEscape(image)+'" data-image-alt="'+sellerEscape(imageAlt)+'" aria-label="Open larger image: '+sellerEscape(imageAlt)+'" title="Click to view larger image"><img class="seller-product-thumb" src="'+sellerEscape(image)+'" alt="'+sellerEscape(imageAlt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>':'<div class="seller-product-thumb" aria-hidden="true" style="display:grid;place-items:center">👕</div>';
        const category=categoryMap.get(String(product.category_id))||'Other';
        const restore='<button class="seller-restore-button" type="button" data-seller-restore-product="'+sellerEscape(id)+'">↶ Restore</button>';
        const permanentDelete='<button class="seller-danger-button seller-permanent-delete-button" type="button" data-seller-permanent-delete-product="'+sellerEscape(id)+'" aria-label="Permanently delete '+sellerEscape(product.name||'product')+'">Delete Permanently</button>';
        return '<tr><td><div class="seller-product-cell">'+thumb+'<div><div class="seller-product-name">'+sellerEscape(product.name||'Unnamed product')+'</div><div class="seller-muted">SKU: '+sellerEscape(product.sku||'—')+'</div></div></div></td><td>'+sellerEscape(category)+'</td><td><strong>'+sellerEscape(money(product.base_price))+'</strong></td><td>'+images.length+'/5 photos</td><td>'+sellerEscape(sellerDate(product.deleted_at))+'</td><td><div class="seller-row-actions seller-deleted-row-actions">'+restore+permanentDelete+'</div></td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-seller-restore-product]').forEach(button=>button.addEventListener('click',()=>handleSellerRestoreProduct(button.dataset.sellerRestoreProduct,button)));
      tbody.querySelectorAll('[data-seller-permanent-delete-product]').forEach(button=>button.addEventListener('click',()=>openSellerPermanentDeleteConfirm(button.dataset.sellerPermanentDeleteProduct,button)));
    }
    async function handleSellerRestoreProduct(productId,button){
      if(!sellerCentreIsUnlocked)return;
      const product=sellerProductRowsById.get(String(productId));
      const productName=product&&product.name?product.name:'this product';
      if(!window.confirm('Restore "'+productName+'" to the live store?\n\nThe existing photos and product details will be reused. The product will return as OUT OF STOCK (zero units) until you add stock in Inventory & Analytics.'))return;
      const originalLabel=button?button.textContent:'↶ Restore';
      if(button){button.disabled=true;button.textContent='Restoring…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('restore_genmerch_product',{p_product_id:productId});
        if(result.error)throw result.error;
        sellerInventoryLoaded=false;
        await loadSellerProducts();
        await loadSupabaseCatalog();
        renderCategoryFilters();renderProducts();
        await loadSellerInventoryAnalytics();
        sellerFeedback('sellerDeletedFeedback','Restored "'+productName+'" to the storefront. Its saved photos were reused and its stock is 0; add stock when ready.','success');
      }catch(error){
        sellerFeedback('sellerDeletedFeedback',error.message||'Could not restore this product.','error');
      }finally{
        if(button){button.disabled=false;button.textContent=originalLabel;}
      }
    }
    function openSellerPermanentDeleteConfirm(productId,triggerButton){
      if(!sellerCentreIsUnlocked)return;
      const product=sellerProductRowsById.get(String(productId));
      if(!product||product.is_deleted!==true){
        sellerFeedback('sellerDeletedFeedback','Only products already in Deleted can be permanently deleted.','error');
        return;
      }
      sellerPendingPermanentDeleteProductId=String(productId);
      sellerPermanentDeleteReturnFocus=triggerButton||null;
      $('sellerPermanentDeleteProductName').textContent=String(product.name||'Unnamed product');
      sellerFeedback('sellerPermanentDeleteFeedback','','');
      $('sellerPermanentDeleteYesButton').disabled=false;
      $('sellerPermanentDeleteYesButton').textContent='YES';
      $('sellerPermanentDeleteNoButton').disabled=false;
      $('sellerPermanentDeleteCloseButton').disabled=false;
      sellerShowOverlay('sellerPermanentDeleteOverlay');
      $('sellerPermanentDeleteNoButton').focus();
    }
    function closeSellerPermanentDeleteConfirm(force=false){
      if(sellerPermanentDeleteBusy&&!force)return;
      sellerHideOverlay('sellerPermanentDeleteOverlay');
      sellerPendingPermanentDeleteProductId='';
      sellerFeedback('sellerPermanentDeleteFeedback','','');
      if(sellerPermanentDeleteReturnFocus&&sellerPermanentDeleteReturnFocus.isConnected)sellerPermanentDeleteReturnFocus.focus();
      sellerPermanentDeleteReturnFocus=null;
    }
    async function handleSellerPermanentDeleteProduct(){
      if(sellerPermanentDeleteBusy||!sellerCentreIsUnlocked)return;
      const productId=String(sellerPendingPermanentDeleteProductId||'');
      const product=sellerProductRowsById.get(productId);
      if(!productId||!product||product.is_deleted!==true){
        sellerFeedback('sellerPermanentDeleteFeedback','This item is no longer available in Deleted. Refresh the tab and try again.','error');
        return;
      }
      const productName=String(product.name||'Unnamed product');
      const yesButton=$('sellerPermanentDeleteYesButton'),noButton=$('sellerPermanentDeleteNoButton'),closeButton=$('sellerPermanentDeleteCloseButton');
      sellerPermanentDeleteBusy=true;
      yesButton.disabled=true;yesButton.textContent='Deleting…';noButton.disabled=true;closeButton.disabled=true;
      sellerFeedback('sellerPermanentDeleteFeedback','','');
      showCenteredActionStatus('Please Wait','loading');
      let deletionSucceeded=false,cleanupWarning='',storagePaths=[];
      try{
        const client=await getSellerAdminClient();
        const imageResult=await client.from('product_images').select('image_url').eq('product_id',productId);
        if(imageResult.error)throw imageResult.error;
        const imageRows=imageResult.data||[];
        const imagePaths=Array.from(new Set(imageRows.map(image=>sellerStoragePathFromPublicUrl(image.image_url)).filter(Boolean)));
        if(imagePaths.length!==imageRows.length){
          throw new Error('Could not identify every product photo in cloud Storage. The product was not deleted; refresh the gallery and try again.');
        }
        const folderListing=await client.storage.from(SELLER_IMAGE_BUCKET).list('products/'+productId,{limit:1000});
        if(folderListing.error)throw new Error('Could not inspect the product photo folder in cloud Storage. The product was not deleted. '+folderListing.error.message);
        const folderPaths=(folderListing.data||[]).filter(item=>item&&item.name).map(item=>'products/'+productId+'/'+item.name);
        storagePaths=Array.from(new Set(imagePaths.concat(folderPaths)));
        const result=await client.rpc('permanently_delete_genmerch_product',{p_product_id:productId});
        if(result.error)throw result.error;
        deletionSucceeded=true;
        const resultData=result.data&&typeof result.data==='object'?result.data:{};
        const confirmedName=String(resultData.deleted_product_name||productName);
        if(storagePaths.length){
          try{
            await sellerRemoveStorageObjects(client,storagePaths);
          }catch(firstCleanupError){
            try{
              await sellerRemoveStorageObjects(client,storagePaths);
            }catch(secondCleanupError){
              cleanupWarning=' Cloud Storage cleanup could not be verified after retries. '+(secondCleanupError.message||firstCleanupError.message||'Please retry cleanup.');
            }
          }
        }
        if(sellerEditingProductId&&String(sellerEditingProductId)===productId)resetSellerProductForm();
        sellerPermanentDeleteBusy=false;
        closeSellerPermanentDeleteConfirm(true);
        sellerInventoryLoaded=false;
        await loadSellerProducts();
        await loadSupabaseCatalog();
        renderCategoryFilters();renderProducts();
        await loadSellerInventoryAnalytics();
        const successMessage='Permanently deleted "'+confirmedName+'". Order history and inventory movement snapshots were preserved.'+cleanupWarning;
        sellerFeedback('sellerDeletedFeedback',successMessage,cleanupWarning?'error':'success');
        showCenteredActionStatus(cleanupWarning?'Product deleted; cloud cleanup needs attention.':'Deleted Successfully!',cleanupWarning?'error':'success',cleanupWarning?3200:1650);
        showToast(cleanupWarning?'Product deleted; cloud photo cleanup needs attention.':'Product permanently deleted.');
      }catch(error){
        if(deletionSucceeded){
          sellerPermanentDeleteBusy=false;
          closeSellerPermanentDeleteConfirm(true);
          sellerFeedback('sellerDeletedFeedback','Product was permanently deleted, but the Seller Centre could not fully refresh. Open the Deleted tab and click Refresh. '+(error.message||''),'error');
        }else{
          sellerFeedback('sellerPermanentDeleteFeedback',error.message||'Could not permanently delete this item. No product changes were made.','error');
          showCenteredActionStatus(error.message||'Could not delete this item. No product changes were made.','error',2300);
          yesButton.disabled=false;yesButton.textContent='YES';noButton.disabled=false;closeButton.disabled=false;
        }
      }finally{
        sellerPermanentDeleteBusy=false;
        if($('sellerPermanentDeleteOverlay').classList.contains('open')){
          yesButton.disabled=false;yesButton.textContent='YES';noButton.disabled=false;closeButton.disabled=false;
        }
      }
    }
    async function handleSellerProductAction(productId,action,feedbackTarget='sellerProductsFeedback'){
      if(action!=='delete'||!sellerCentreIsUnlocked)return;
      const existingProduct=sellerProductRowsById.get(String(productId));
      const productName=existingProduct&&existingProduct.name?existingProduct.name:'this product';
      if(existingProduct&&existingProduct.is_deleted===true){sellerFeedback(feedbackTarget,'This product is already in Deleted.','error');return;}
      const confirmed=window.confirm(
        'MOVE "'+productName+'" TO DELETED?\n\nIt will disappear from the customer storefront and active inventory. The product details, uploaded photos, and gallery will be kept. Stock will reset to zero. You can restore it later; it will return as OUT OF STOCK until restocked.'
      );
      if(!confirmed)return;
      showCenteredActionStatus('Please Wait','loading');
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('delete_genmerch_product',{p_product_id:productId});
        if(result.error)throw result.error;
        if(sellerEditingProductId&&String(sellerEditingProductId)===String(productId))resetSellerProductForm();
        sellerInventoryLoaded=false;
        await loadSellerProducts();
        await loadSupabaseCatalog();
        renderCategoryFilters();renderProducts();
        await loadSellerInventoryAnalytics();
        sellerFeedback(feedbackTarget,'Moved "'+productName+'" to Deleted. Its photos and details are preserved; stock was reset to zero. You can restore it from the Deleted tab.','success');
        showCenteredActionStatus('Deleted Successfully!','success',1650);
      }catch(error){
        sellerFeedback(feedbackTarget,error.message||'Could not move this product to Deleted.','error');
        showCenteredActionStatus(error.message||'Could not delete this product. Please try again.','error',2200);
      }finally{if(isCenteredActionStatusLoading())hideCenteredActionStatus();}
    }
    function sellerClearPreviewUrls(){sellerPreviewObjectUrls.forEach(url=>URL.revokeObjectURL(url));sellerPreviewObjectUrls=[];}
    function sellerGetSelectedPhotoEntries(){return SELLER_IMAGE_INPUT_IDS.map((id,index)=>{const file=$(id).files&&$(id).files[0];return file?{file,slot:index+1,colorLabel:sellerNormalizeColorLabel($('sellerImageColor'+(index+1)).value)}:null;}).filter(Boolean);}
    function sellerGetSelectedFiles(){return sellerGetSelectedPhotoEntries().map(entry=>entry.file);}
    function sellerGetExistingImageColorMap(){const map=new Map();$('sellerExistingGallery').querySelectorAll('[data-seller-image-color-existing]').forEach(input=>map.set(String(input.dataset.sellerImageColorExisting),sellerNormalizeColorLabel(input.value)));return map;}
    function sellerGetImageRemovalIds(){return new Set(Array.from($('sellerExistingGallery').querySelectorAll('[data-seller-remove-image]:checked')).map(input=>input.value));}
    function sellerUpdateGalleryCount(){
      const entries=sellerGetSelectedPhotoEntries(),files=entries.map(entry=>entry.file),removed=sellerGetImageRemovalIds(),retained=sellerEditingProductId?sellerEditingImages.filter(image=>!removed.has(String(image.id))).length:0,total=retained+files.length,count=$('sellerGalleryCount');
      count.classList.toggle('error',total>SELLER_IMAGE_MAX_COUNT);
      count.textContent=sellerEditingProductId?'Gallery total after save: '+total+'/30 photos ('+retained+' kept + '+files.length+' new).':'Selected: '+files.length+'/30 photos. At least 1 photo is required.';
      return {files,entries,retained,total,removed};
    }
    function sellerRenderUploadPreviews(){
      sellerClearPreviewUrls();const container=$('sellerUploadPreview'),entries=sellerGetSelectedPhotoEntries();
      if(!entries.length){container.innerHTML='';container.hidden=true;sellerUpdateGalleryCount();return;}
      container.hidden=false;
      container.innerHTML=entries.map(entry=>{const file=entry.file,url=URL.createObjectURL(file);sellerPreviewObjectUrls.push(url);return '<div class="seller-gallery-item"><img src="'+url+'" alt="'+sellerEscape(file.name)+'"><div class="seller-gallery-file-name">'+sellerEscape(file.name)+'</div><div class="seller-gallery-file-name">'+(file.size/1024/1024).toFixed(2)+' MB</div><div class="seller-gallery-file-name">Color: '+sellerEscape(entry.colorLabel||'Not entered')+'</div></div>';}).join('');
      sellerUpdateGalleryCount();
    }
    function sellerRenderExistingGallery(){
      const container=$('sellerExistingGallery');
      if(!sellerEditingProductId){container.innerHTML='';container.hidden=true;sellerUpdateGalleryCount();return;}
      container.hidden=false;
      if(!sellerEditingImages.length){container.innerHTML='<div class="seller-gallery-empty">No current photos. Upload at least one image before saving.</div>';sellerUpdateGalleryCount();return;}
      container.innerHTML=sellerEditingImages.map(image=>{
        const url=safeCatalogImageUrl(image.image_url),thumb=url?'<img src="'+sellerEscape(url)+'" alt="'+sellerEscape(image.alt_text||'Product gallery photo')+'" loading="lazy" decoding="async">':'<div class="seller-product-thumb">Image</div>';
        return '<div class="seller-gallery-item">'+thumb+'<span class="seller-gallery-file-name">'+sellerEscape(image.is_primary?'Main photo':'Gallery photo')+'</span><label class="seller-gallery-color-label" for="sellerImageColorExisting_'+sellerEscape(image.id)+'">Customer color</label><input id="sellerImageColorExisting_'+sellerEscape(image.id)+'" class="seller-gallery-color-input" type="text" data-seller-image-color-existing="'+sellerEscape(image.id)+'" value="'+sellerEscape(sellerNormalizeColorLabel(image.color_label))+'" maxlength="60" autocomplete="off" placeholder="Color (e.g. BLUE)" aria-label="Customer-facing color for gallery photo '+sellerEscape(image.sort_order+1)+'"><label class="seller-gallery-remove"><input type="checkbox" data-seller-remove-image value="'+sellerEscape(image.id)+'"> Remove</label></div>';
      }).join('');
      sellerUpdateGalleryCount();
    }
    function openSellerProductCreate(){
      if(!sellerCentreIsUnlocked)return;
      resetSellerProductForm();
      sellerSetFormMode('create');
      sellerShowOverlay('sellerProductEditorOverlay');
      window.setTimeout(()=>$('sellerProductName').focus({preventScroll:true}),35);
    }
    function closeSellerProductEditor(reset=true){
      if(reset)resetSellerProductForm();
      sellerHideOverlay('sellerProductEditorOverlay');
    }
    function sellerSetFormMode(mode){
      const editing=mode==='edit';$('sellerProductFormTitle').textContent=editing?'Edit product':'Add a product';
      $('sellerProductFormSubtitle').textContent=editing?'Update product details and manage its gallery. Keep 1–30 photos total; each new upload must be 2 MB or smaller.':'New products save to Supabase. Upload 1–30 gallery photos; each photo must be 2 MB or smaller. Default size/color variants start at zero stock.';
      $('sellerSaveProductButton').textContent=editing?'Save product changes':'＋ Add product to Supabase';$('sellerCancelEditButton').hidden=!editing;$('sellerProductForm').classList.toggle('editing',editing);$('sellerProductLocation').required=!editing;
    }
    function resetSellerProductForm(){
      sellerEditingProductId=null;sellerEditingProductSku='';sellerEditingVariants=[];sellerSelectedSizes=new Set();sellerEditingImages=[];$('sellerProductForm').reset();SELLER_IMAGE_INPUT_IDS.forEach((id,index)=>{$(id).value='';$('sellerImageColor'+(index+1)).value='';});sellerClearPreviewUrls();
      $('sellerUploadPreview').innerHTML='';$('sellerUploadPreview').hidden=true;$('sellerExistingGallery').innerHTML='';$('sellerExistingGallery').hidden=true;
      sellerSetFormMode('create');sellerRenderSizeOptions('',[]);sellerFeedback('sellerProductFeedback','','');sellerUpdateGalleryCount();
    }
    async function openSellerProductEditor(productId){
      if(!sellerCentreIsUnlocked)return;sellerFeedback('sellerProductFeedback','','');
      try{
        const client=await getSellerAdminClient(),results=await Promise.all([
          client.from('products').select('id,category_id,name,slug,sku,description,base_price,compare_at_price,regular_price,promotion_type,promotion_value,location,is_active').eq('id',productId).single(),
          client.from('product_images').select('id,product_id,image_url,alt_text,sort_order,is_primary,color_label').eq('product_id',productId).order('is_primary',{ascending:false}).order('sort_order',{ascending:true}),
          client.from('product_variants').select('id,product_id,sku,size_label,color_label,price_override,stock_quantity,is_active').eq('product_id',productId)
        ]);
        for(const result of results)if(result.error)throw result.error;
        const product=results[0].data;sellerEditingProductId=String(product.id);sellerEditingProductSku=String(product.sku||'');sellerEditingImages=results[1].data||[];sellerEditingVariants=results[2].data||[];
        $('sellerProductName').value=product.name||'';$('sellerProductCategory').value=product.category_id||'';
        $('sellerProductLocation').value=product.location||'';$('sellerSellingPrice').value=String(product.regular_price||product.compare_at_price||product.base_price||'');
        $('sellerPromotionType').value=product.promotion_type==='percent'?String(Number(product.promotion_value)||0):String(product.promotion_type||'none');
        $('sellerOriginalPrice').value=product.compare_at_price===null||product.compare_at_price===undefined?'':String(product.compare_at_price);sellerUpdatePromotionPreview();
        $('sellerProductDescription').value=product.description||'';SELLER_IMAGE_INPUT_IDS.forEach((id,index)=>{$(id).value='';$('sellerImageColor'+(index+1)).value='';});sellerClearPreviewUrls();$('sellerUploadPreview').innerHTML='';$('sellerUploadPreview').hidden=true;
        const categoryName=(sellerCategories.find(row=>String(row.id)===String(product.category_id))||{}).name||'';
        const options=sellerSizeOptionsForCategory(categoryName);
        sellerSelectedSizes=new Set(options.filter(size=>sellerEditingVariants.some(variant=>variant.size_label===size&&variant.is_active!==false)));
        sellerRenderSizeOptions(categoryName,sellerSelectedSizes);
        sellerSetFormMode('edit');sellerRenderExistingGallery();sellerShowOverlay('sellerProductEditorOverlay');window.setTimeout(()=>$('sellerProductName').focus({preventScroll:true}),35);
      }catch(error){sellerFeedback('sellerProductFeedback',error.message||'Could not load this product for editing.','error');}
    }
    function sellerValidateFiles(files){
      if(files.length>SELLER_IMAGE_MAX_COUNT)return 'Select no more than 30 new photos at once.';
      for(const file of files){if(!Object.prototype.hasOwnProperty.call(SELLER_IMAGE_TYPES,file.type))return 'Only JPEG, PNG, and WebP images are supported.';if(file.size>SELLER_IMAGE_MAX_BYTES)return '“'+file.name+'” exceeds the 2 MB limit. Choose a smaller image.';if(file.size===0)return '“'+file.name+'” is empty. Choose another image.';}
      return '';
    }
    function handleSellerImageSelection(event){
      sellerFeedback('sellerProductFeedback','','');const files=sellerGetSelectedFiles(),validation=sellerValidateFiles(files);
      if(validation){if(event&&event.target&&event.target.matches('input[type="file"]'))event.target.value='';sellerRenderUploadPreviews();sellerFeedback('sellerProductFeedback',validation,'error');return;}
      sellerRenderUploadPreviews();const current=sellerUpdateGalleryCount();
      if(current.total>SELLER_IMAGE_MAX_COUNT)sellerFeedback('sellerProductFeedback','Keep no more than 30 gallery photos in total. Mark existing photos for removal or choose fewer new photos.','error');
    }
    function sellerStoragePathFromPublicUrl(value){
      try{const url=new URL(String(value||'')),marker='/storage/v1/object/public/'+SELLER_IMAGE_BUCKET+'/',index=url.pathname.indexOf(marker);if(index<0)return '';const path=decodeURIComponent(url.pathname.slice(index+marker.length));return path.startsWith('products/')?path:'';}catch(_){return '';}
    }
    async function sellerRemoveStorageObjects(client,paths){
      let pending=Array.from(new Set((paths||[]).filter(path=>typeof path==='string'&&path.startsWith('products/'))));
      let lastError='';
      for(let attempt=1;attempt<=3&&pending.length;attempt++){
        const removal=await client.storage.from(SELLER_IMAGE_BUCKET).remove(pending);
        if(removal.error)lastError=removal.error.message||String(removal.error);
        const stillPresent=[];
        for(const path of pending){
          const slash=path.lastIndexOf('/'),folder=slash>=0?path.slice(0,slash):'',fileName=slash>=0?path.slice(slash+1):path;
          const listing=await client.storage.from(SELLER_IMAGE_BUCKET).list(folder,{limit:1000});
          if(listing.error){
            stillPresent.push(path);
            lastError=listing.error.message||String(listing.error);
          }else if((listing.data||[]).some(item=>item.name===fileName)){
            stillPresent.push(path);
            lastError='Storage still lists '+fileName+' after a delete attempt.';
          }
        }
        pending=stillPresent;
        if(!pending.length)return;
        if(attempt<3)await new Promise(resolve=>window.setTimeout(resolve,250*attempt));
      }
      throw new Error('Cloud Storage cleanup could not be verified for '+pending.length+' product photo file(s). '+lastError);
    }
    async function sellerUploadFiles(client,productId,photoEntries,startOrder,uploadedPaths){
      const rows=[];
      for(let i=0;i<photoEntries.length;i++){
        const entry=photoEntries[i],file=entry.file,extension=SELLER_IMAGE_TYPES[file.type],validation=sellerValidateFiles([file]);if(validation)throw new Error(validation);
        if(!entry.colorLabel)throw new Error('Enter a customer-facing color label for every selected photo (for example, BLUE).');
        const path='products/'+productId+'/'+Date.now()+'_'+sellerRandomSuffix()+'.'+extension;
        const upload=await client.storage.from(SELLER_IMAGE_BUCKET).upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:false});if(upload.error)throw upload.error;
        uploadedPaths.push(path);const publicUrl=client.storage.from(SELLER_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
        rows.push({product_id:productId,image_url:publicUrl,alt_text:file.name.slice(0,250),color_label:entry.colorLabel,sort_order:startOrder+i,is_primary:false});
      }
      return rows;
    }
    async function sellerNormalizeGallery(client,productId){
      const loaded=await client.from('product_images').select('id,sort_order,is_primary').eq('product_id',productId).order('is_primary',{ascending:false}).order('sort_order',{ascending:true});
      if(loaded.error)throw loaded.error;const rows=loaded.data||[];if(!rows.length)throw new Error('Each product must retain at least one gallery photo.');
      const clear=await client.from('product_images').update({is_primary:false}).eq('product_id',productId);if(clear.error)throw clear.error;
      for(let i=0;i<rows.length;i++){const result=await client.from('product_images').update({sort_order:i,is_primary:i===0}).eq('id',rows[i].id).eq('product_id',productId);if(result.error)throw result.error;}
    }
    async function submitSellerProduct(event){
      event.preventDefault();if(!sellerCentreIsUnlocked)return;
      showCenteredActionStatus('Saving product details, please wait...','loading');
      const form=$('sellerProductForm'),button=$('sellerSaveProductButton');button.disabled=true;button.textContent=sellerEditingProductId?'Saving changes…':'Uploading photos…';sellerFeedback('sellerProductFeedback','','');
      const editingId=sellerEditingProductId,wasEditing=Boolean(editingId),uploadedPaths=[];let insertedImageRows=false,productCreatedId=null,removedImagesToRestore=[],removedDbImages=false,editGalleryCommitComplete=false,galleryCleanupWarning='';
      try{
        const client=await getSellerAdminClient(),name=String($('sellerProductName').value||'').trim(),categoryId=String($('sellerProductCategory').value||'').trim();
        const categoryName=(sellerCategories.find(row=>String(row.id)===categoryId)||{}).name||'Other',location=String($('sellerProductLocation').value||'').trim(),description=String($('sellerProductDescription').value||'').trim();
        const regularPrice=Number($('sellerSellingPrice').value),promotionSelection=String($('sellerPromotionType').value||'none'),promotionType=['10','15','20','25','30','35','40','50','60','70'].includes(promotionSelection)?'percent':promotionSelection,promotionValue=promotionType==='percent'?Number(promotionSelection):0,originalRaw=String($('sellerOriginalPrice').value||'').trim(),original=originalRaw===''?null:Number(originalRaw),price=promotionType==='percent'?Math.round(regularPrice*(1-promotionValue/100)*100)/100:regularPrice;
        const selection=sellerUpdateGalleryCount(),files=selection.files,photoEntries=selection.entries,validation=sellerValidateFiles(files);
        const selectedSizes=sellerUpdateSizeCount();
        if(!name||!categoryId||(!editingId&&!location))throw new Error('Complete product name and category. A location is required for new products.');
        if(!selectedSizes.length)throw new Error('Select at least one available clothing size.');
        if(!Number.isFinite(regularPrice)||regularPrice<=0)throw new Error('Regular price must be greater than zero.');
        if(original!==null&&(!Number.isFinite(original)||original<regularPrice))throw new Error('Compare-at price must be blank or greater than or equal to the regular price.');
        if(promotionType==='percent'&&(![10,15,20,25,30,35,40,50,60,70].includes(promotionValue)||price<=0))throw new Error('Choose a valid promotional discount.');
        if(validation)throw new Error(validation);
        const existing=editingId?sellerEditingImages.slice():[],removedIds=editingId?sellerGetImageRemovalIds():new Set();
        const retained=existing.filter(image=>!removedIds.has(String(image.id))),finalCount=retained.length+files.length;
        const existingColorMap=sellerGetExistingImageColorMap();
        const retainedColorLabels=retained.map(image=>existingColorMap.get(String(image.id))||'');
        const finalColorLabels=retainedColorLabels.concat(photoEntries.map(entry=>entry.colorLabel));
        const hasAnyPhotoColor=finalColorLabels.some(Boolean),hasAllPhotoColors=finalColorLabels.length>0&&finalColorLabels.every(Boolean);
        let desiredVariantColors=null;
        if(!editingId){
          if(!photoEntries.length||photoEntries.some(entry=>!entry.colorLabel))throw new Error('Enter a customer-facing color label beside every selected photo (for example, BLUE).');
          desiredVariantColors=sellerUniqueColorLabels(photoEntries.map(entry=>entry.colorLabel));
          if(!desiredVariantColors.length)throw new Error('Enter at least one valid product color.');
        }else{
          if((files.length>0||hasAnyPhotoColor)&&!hasAllPhotoColors)throw new Error('For color-specific inventory, enter a color label for every retained and new gallery photo. If this product has no color labels, leave all photo color fields blank.');
          if(hasAllPhotoColors)desiredVariantColors=sellerUniqueColorLabels(finalColorLabels);
        }
        if(finalCount<1)throw new Error('Each product needs at least one photo in its gallery.');
        if(finalCount>SELLER_IMAGE_MAX_COUNT)throw new Error('A product can have no more than 30 gallery photos total. Remove an existing photo or select fewer new images.');
        let productId=editingId;
        if(!editingId){
          const suffix=sellerRandomSuffix(),slug=sellerSlugify(name)+'-'+suffix.toLowerCase(),sku=sellerMakeSku(name,suffix);
          const created=await client.from('products').insert({name,category_id:categoryId,slug,sku,description:description||null,base_price:price,regular_price:regularPrice,promotion_type:promotionType,promotion_value:promotionValue,compare_at_price:promotionType==='percent'?regularPrice:(promotionType==='none'?original:null),location,is_active:false,is_demo:false,is_featured:false}).select('id,name,sku').single();
          if(created.error)throw created.error;productId=created.data.id;productCreatedId=productId;
          const imageRows=await sellerUploadFiles(client,productId,photoEntries,0,uploadedPaths);
          const imageInsert=await client.from('product_images').insert(imageRows);if(imageInsert.error)throw imageInsert.error;insertedImageRows=true;
          await sellerNormalizeGallery(client,productId);
          const variantInsert=await client.from('product_variants').insert(sellerVariantRows(productId,sku,categoryName,selectedSizes,desiredVariantColors));if(variantInsert.error)throw variantInsert.error;
          const activate=await client.from('products').update({is_active:true}).eq('id',productId);if(activate.error)throw activate.error;
          productCreatedId=null;resetSellerProductForm();sellerFeedback('sellerProductFeedback','Product saved to Supabase with '+files.length+' gallery photo(s) and default size variants. Stock starts at 0; set verified inventory before accepting purchases.','success');
        }else{
          const newImageRows=await sellerUploadFiles(client,productId,photoEntries,retained.length,uploadedPaths);
          const updated=await client.from('products').update({name,category_id:categoryId,description:description||null,base_price:price,regular_price:regularPrice,promotion_type:promotionType,promotion_value:promotionValue,compare_at_price:promotionType==='percent'?regularPrice:(promotionType==='none'?original:null),location:location||null}).eq('id',productId);if(updated.error)throw updated.error;
          if(removedIds.size){
            removedImagesToRestore=existing.filter(image=>removedIds.has(String(image.id)));
            const removeDb=await client.from('product_images').delete().eq('product_id',productId).in('id',Array.from(removedIds));if(removeDb.error)throw removeDb.error;
            removedDbImages=true;
          }
          if(newImageRows.length){const imageInsert=await client.from('product_images').insert(newImageRows);if(imageInsert.error)throw imageInsert.error;insertedImageRows=true;}
          for(const image of retained){
            const colorUpdate=await client.from('product_images').update({color_label:existingColorMap.get(String(image.id))||null}).eq('id',image.id).eq('product_id',productId);
            if(colorUpdate.error)throw colorUpdate.error;
          }
          await sellerNormalizeGallery(client,productId);
          await sellerApplySelectedSizes(client,productId,sellerEditingProductSku||'GM-'+sellerSlugify(name).toUpperCase(),categoryName,selectedSizes,desiredVariantColors);
          editGalleryCommitComplete=true;
          const oldPaths=removedImagesToRestore.map(image=>sellerStoragePathFromPublicUrl(image.image_url)).filter(Boolean);
          if(oldPaths.length){
            try{await sellerRemoveStorageObjects(client,oldPaths);}
            catch(storageError){galleryCleanupWarning=' Product details were saved, but cloud cleanup for one or more removed gallery photos could not be verified. '+(storageError.message||'Please review Storage cleanup.');}
          }
          resetSellerProductForm();sellerFeedback('sellerProductFeedback',galleryCleanupWarning?'Product details were saved, but photo cleanup needs attention.'+galleryCleanupWarning:'Product details and gallery saved to Supabase.',galleryCleanupWarning?'error':'success');
        }
        sellerInventoryLoaded=false;await loadSellerProducts();await loadSupabaseCatalog();renderCategoryFilters();renderProducts();
        sellerHideOverlay('sellerProductEditorOverlay');
        showCenteredActionStatus(galleryCleanupWarning?'Gallery saved; cloud photo cleanup needs attention.':(wasEditing?'Product updated successfully!':'Product added successfully!'),galleryCleanupWarning?'error':'success',galleryCleanupWarning?3200:1600);
      }catch(error){
        if((uploadedPaths.length||removedDbImages)&&!editGalleryCommitComplete){
          try{
            const client=await getSellerAdminClient();
            if(insertedImageRows&&editingId)await client.from('product_images').delete().eq('product_id',editingId).in('image_url',uploadedPaths.map(path=>client.storage.from(SELLER_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl));
            if(uploadedPaths.length)await client.storage.from(SELLER_IMAGE_BUCKET).remove(uploadedPaths);
            if(editingId&&removedDbImages&&removedImagesToRestore.length){
              const restored=await client.from('product_images').insert(removedImagesToRestore);
              if(restored.error)console.warn('Removed gallery records could not be fully restored:',restored.error.message);
            }
            if(editingId){
              for(const image of sellerEditingImages){
                const restoreImage=await client.from('product_images').update({sort_order:image.sort_order,is_primary:image.is_primary}).eq('id',image.id).eq('product_id',editingId);
                if(restoreImage.error)console.warn('Gallery order rollback was incomplete:',restoreImage.error.message);
              }
            }
          }catch(cleanupError){console.warn('Seller Centre gallery rollback was incomplete:',cleanupError);}
        }
        if(productCreatedId){
          try{const client=await getSellerAdminClient();await client.from('product_images').delete().eq('product_id',productCreatedId);await client.from('product_variants').delete().eq('product_id',productCreatedId);await client.from('products').delete().eq('id',productCreatedId);}catch(_){}
        }
        sellerFeedback('sellerProductFeedback',(error.message||'Could not save the product or gallery. Check Storage and database permissions.'),'error');
        showCenteredActionStatus(error.message||'Could not save the product. Please try again.','error',2400);
      }finally{if(isCenteredActionStatusLoading())hideCenteredActionStatus();button.disabled=false;button.textContent=sellerEditingProductId?'Save product changes':'＋ Add product to Supabase';}
    }

    function sellerOrdersRealtimeIsActive(){
      return sellerOrdersRealtimeChannel!==null&&sellerOrdersRealtimeStatus==='SUBSCRIBED';
    }
    function stopSellerOrdersFallbackPolling(){
      if(sellerOrdersRefreshTimer!==null){window.clearInterval(sellerOrdersRefreshTimer);sellerOrdersRefreshTimer=null;}
    }
    function startSellerOrdersFallbackPolling(){
      if(sellerOrdersRefreshTimer!==null)return;
      sellerOrdersRefreshTimer=window.setInterval(()=>{
        if(sellerCentreIsUnlocked&&sellerCurrentTab==='orders'&&!document.hidden&&!sellerOrdersRealtimeIsActive())loadSellerOrders(true);
      },60000);
    }
    function scheduleSellerOrdersRealtimeRefresh(){
      if(sellerOrdersRealtimeRefreshTimer!==null)window.clearTimeout(sellerOrdersRealtimeRefreshTimer);
      sellerOrdersRealtimeRefreshTimer=window.setTimeout(()=>{
        sellerOrdersRealtimeRefreshTimer=null;
        if(sellerCentreIsUnlocked&&sellerCurrentTab==='orders'&&!document.hidden)loadSellerOrders(true);
      },450);
    }
    function stopSellerOrdersRealtime(){
      const channel=sellerOrdersRealtimeChannel,client=sellerOrdersRealtimeClient;
      sellerOrdersRealtimeChannel=null;sellerOrdersRealtimeClient=null;sellerOrdersRealtimeStatus='idle';sellerOrdersRealtimeHasSubscribed=false;
      if(channel&&client){
        try{
          const removal=client.removeChannel(channel);
          if(removal&&typeof removal.catch==='function')removal.catch(error=>console.warn('Seller Centre Orders Realtime channel cleanup failed.',error));
        }catch(error){console.warn('Seller Centre Orders Realtime channel cleanup failed.',error);}
      }
    }
    function stopSellerOrdersAutoRefresh(){
      stopSellerOrdersFallbackPolling();
      if(sellerOrdersRealtimeRefreshTimer!==null){window.clearTimeout(sellerOrdersRealtimeRefreshTimer);sellerOrdersRealtimeRefreshTimer=null;}
      stopSellerOrdersRealtime();
    }
    function startSellerOrdersAutoRefresh(){
      if(!sellerCentreIsUnlocked||sellerCurrentTab!=='orders')return;
      startSellerOrdersFallbackPolling();
      if(!sellerOrdersVisibilityListenerBound){
        document.addEventListener('visibilitychange',()=>{
          if(!document.hidden&&sellerCentreIsUnlocked&&sellerCurrentTab==='orders')loadSellerOrders(true);
        });
        sellerOrdersVisibilityListenerBound=true;
      }
      if(sellerOrdersRealtimeChannel||sellerOrdersRealtimeSetupPromise)return;
      sellerOrdersRealtimeSetupPromise=(async()=>{
        let client=null;
        try{
          client=await getSellerAdminClient();
          if(!sellerCentreIsUnlocked||sellerCurrentTab!=='orders')return;
          if(sellerOrdersRealtimeChannel)return;
          const nextChannel=client.channel('genmerch-seller-orders-admin')
            .on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>scheduleSellerOrdersRealtimeRefresh());
          sellerOrdersRealtimeClient=client;
          sellerOrdersRealtimeChannel=nextChannel;
          sellerOrdersRealtimeStatus='joining';
          nextChannel.subscribe(status=>{
            if(sellerOrdersRealtimeChannel!==nextChannel)return;
            const wasSubscribed=sellerOrdersRealtimeHasSubscribed;
            sellerOrdersRealtimeStatus=status;
            if(status==='SUBSCRIBED'){
              sellerOrdersRealtimeHasSubscribed=true;
              stopSellerOrdersFallbackPolling();
              if(wasSubscribed&&sellerCentreIsUnlocked&&sellerCurrentTab==='orders'&&!document.hidden)scheduleSellerOrdersRealtimeRefresh();
            }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
              startSellerOrdersFallbackPolling();
            }
          });
        }catch(error){
          if(sellerOrdersRealtimeClient===client){
            sellerOrdersRealtimeChannel=null;sellerOrdersRealtimeClient=null;
          }
          sellerOrdersRealtimeStatus='ERROR';
          startSellerOrdersFallbackPolling();
          console.warn('Seller Centre Orders Realtime is unavailable; 60-second fallback polling is active.',error);
        }finally{
          sellerOrdersRealtimeSetupPromise=null;
        }
      })();
    }
    function switchSellerTab(tab){
      sellerCurrentTab=SELLER_CENTRE_ALLOWED_TABS.has(tab)?tab:'products';
      if(sellerCentreIsUnlocked&&$('sellerDashboardOverlay').classList.contains('open')){try{sessionStorage.setItem(SELLER_CENTRE_TAB_STATE_KEY,sellerCurrentTab);}catch(error){console.warn('Seller Centre active tab could not be saved.',error);}}
      const productsSelected=sellerCurrentTab==='products',deletedSelected=sellerCurrentTab==='deleted',ordersSelected=sellerCurrentTab==='orders',inventorySelected=sellerCurrentTab==='inventory',movementsSelected=sellerCurrentTab==='movements';
      $('sellerProductsPanel').hidden=!productsSelected;$('sellerDeletedPanel').hidden=!deletedSelected;$('sellerOrdersPanel').hidden=!ordersSelected;$('sellerInventoryPanel').hidden=!inventorySelected;$('sellerMovementsPanel').hidden=!movementsSelected;
      $('sellerProductsTab').classList.toggle('active',productsSelected);$('sellerDeletedTab').classList.toggle('active',deletedSelected);$('sellerOrdersTab').classList.toggle('active',ordersSelected);$('sellerInventoryTab').classList.toggle('active',inventorySelected);$('sellerMovementsTab').classList.toggle('active',movementsSelected);
      $('sellerProductsTab').setAttribute('aria-selected',String(productsSelected));$('sellerDeletedTab').setAttribute('aria-selected',String(deletedSelected));$('sellerOrdersTab').setAttribute('aria-selected',String(ordersSelected));$('sellerInventoryTab').setAttribute('aria-selected',String(inventorySelected));$('sellerMovementsTab').setAttribute('aria-selected',String(movementsSelected));
      if(ordersSelected){if(!sellerOrdersLoaded)loadSellerOrders();startSellerOrdersAutoRefresh();}
      else stopSellerOrdersAutoRefresh();
      if((inventorySelected||movementsSelected)&&!sellerInventoryLoaded)loadSellerInventoryAnalytics();
      if(deletedSelected)loadSellerProducts();
    }
    async function refreshSellerTab(){
      showCenteredActionStatus('Please wait...','loading');
      try{
        if(sellerCurrentTab==='orders')await loadSellerOrders();
        else if(sellerCurrentTab==='inventory'||sellerCurrentTab==='movements')await loadSellerInventoryAnalytics();
        else await loadSellerProducts();
      }finally{if(isCenteredActionStatusLoading())hideCenteredActionStatus();}
    }
    function sellerDate(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'});}
    const SELLER_ORDER_NEXT_STEP={
      pending:{next:'confirmed',label:'Confirm Order'},
      confirmed:{next:'processing',label:'Prepare Order'},
      shipped:{next:'out_for_delivery',label:'Mark Out for Delivery'}
    };
    const GENMERCH_SHIPPING_COURIERS=['LBC','JRS','Lalamove','Grab','J&T','In-House Delivery (GenMerch)'];
    function sellerOrderStatusLabel(status){
      return (CUSTOMER_ORDER_STATUS_META[String(status||'pending').toLowerCase()]||{label:String(status||'Pending').replace(/_/g,' ')}).label;
    }
    async function advanceSellerOrderStatus(orderId,orderNumber,nextStatus,button){
      const targetStatus=String(nextStatus||'').toLowerCase();
      const targetLabel=({
        confirmed:'Confirm Order',
        processing:'Prepare Order',
        out_for_delivery:'Mark Out for Delivery'
      })[targetStatus];
      // Do not resolve this label through SELLER_ORDER_NEXT_STEP:
      // that map is keyed by the CURRENT status and no longer has a processing step,
      // because processing now opens the dedicated courier setup form.
      if(!targetLabel)return;
      if(!window.confirm('Update '+(orderNumber||'this order')+' to "'+sellerOrderStatusLabel(targetStatus)+'"? The customer will see this status in My Orders.'))return;
      if(button){button.disabled=true;button.textContent='Updating…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('update_genmerch_order_status',{p_order_id:orderId,p_new_status:targetStatus,p_note:''});
        if(result.error)throw result.error;
        sellerOrdersLoaded=false;
        await loadSellerOrders(true);
        sellerFeedback('sellerOrdersFeedback',(orderNumber||'Order')+' updated: '+sellerOrderStatusLabel(targetStatus)+'. The customer order timeline has been updated.','success');
        showToast((orderNumber||'Order')+' updated to '+sellerOrderStatusLabel(targetStatus)+'.');
      }catch(error){
        const message=error&&error.message?error.message:'Could not update this order status.';
        sellerFeedback('sellerOrdersFeedback',message,'error');
        showToast(message);
        if(button){button.disabled=false;button.textContent=targetLabel;}
      }
    }
    async function markSellerOrderShipped(orderId,orderNumber,button){
      const panel=button.closest('.seller-shipping-setup');
      const courierInput=panel&&panel.querySelector('[data-seller-courier]');
      const referenceInput=panel&&panel.querySelector('[data-seller-reference]');
      const courier=courierInput?courierInput.value:'';
      const reference=referenceInput?referenceInput.value.trim():'';
      if(!courier){sellerFeedback('sellerOrdersFeedback','Select a courier before marking the order as shipped.','error');if(courierInput)courierInput.focus();return;}
      if(!reference){sellerFeedback('sellerOrdersFeedback','Enter the delivery reference number before marking the order as shipped.','error');if(referenceInput)referenceInput.focus();return;}
      if(!window.confirm('Mark '+(orderNumber||'this order')+' as shipped with '+courier+' and reference '+reference+'? The customer will see these shipping details.'))return;
      if(button){button.disabled=true;button.textContent='Saving shipment…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('mark_genmerch_order_shipped',{p_order_id:orderId,p_courier_name:courier,p_tracking_number:reference});
        if(result.error)throw result.error;
        let shipmentEmailSent=false;
        let shipmentEmailNotice='';
        let shipmentRecipient='';
        try{
          const emailResponse=await client.functions.invoke('send-genmerch-shipment-notification',{
            body:{order_id:orderId,order_number:orderNumber}
          });
          if(emailResponse.error)throw emailResponse.error;
          const emailData=emailResponse.data||{};
          if(!emailData.ok)throw new Error(emailData.message||'The email provider did not confirm the shipping notification.');
          shipmentEmailSent=true;
          shipmentRecipient=String(emailData.recipient_email||'');
          shipmentEmailNotice=emailData.already_sent
            ?' The shipping notification was already recorded as sent.'
            :' A shipping email was sent to '+shipmentRecipient+'.';
        }catch(emailError){
          let detail=emailError&&emailError.message?String(emailError.message):'Email delivery is temporarily unavailable.';
          if(emailError&&emailError.context&&typeof emailError.context.json==='function'){
            try{const errorBody=await emailError.context.json();if(errorBody&&errorBody.message)detail=String(errorBody.message);}catch(_){}
          }
          shipmentEmailNotice=' The order was successfully marked as shipped, but the shipping email could not be sent: '+detail;
          console.error('Shipment saved but customer shipping email failed.',emailError);
        }
        sellerOrdersLoaded=false;
        await loadSellerOrders(true);
        sellerFeedback('sellerOrdersFeedback',(orderNumber||'Order')+' marked In Transit via '+courier+'. Delivery reference saved.'+shipmentEmailNotice,shipmentEmailSent?'success':'error');
        if(shipmentEmailSent)showToast('Shipping update email sent to '+shipmentRecipient+'.');
      }catch(error){
        sellerFeedback('sellerOrdersFeedback',error.message||'Could not save shipping details. The order status was not advanced.','error');
        if(button){button.disabled=false;button.textContent='Mark as Shipped';}
      }
    }
    async function maybeSendGenmerchDeliverySurveyEmail(client,payload){
      try{
        const response=await client.functions.invoke('send-genmerch-delivery-survey-email',{body:payload||{}});
        if(response.error)throw response.error;
        const data=response.data||{};
        if(!data.ok&&data.eligible!==false&&!data.already_sent)console.warn('GENMERCH delivery survey email was not sent.',data.message||'Unknown email error.');
        else if(data.ok&&data.eligible&&data.delivery_status==='sent')console.info('GENMERCH delivery survey email accepted for '+String(data.recipient_email||'the customer')+'.');
        return data;
      }catch(error){console.warn('GENMERCH delivery survey email request failed.',error);return null;}
    }
    async function sendSellerRefundEmail(orderId,orderNumber,button){
      if(!orderId)return;
      if(!window.confirm('Send the refund notification for '+(orderNumber||'this order')+'? Only continue if the refund has already been confirmed in GENMERCH.'))return;
      if(button){button.disabled=true;button.textContent='Sending Refund Email…';}
      try{
        const client=await getSellerAdminClient();
        const response=await client.functions.invoke('send-genmerch-refund-email',{body:{order_id:orderId}});
        if(response.error)throw response.error;
        const data=response.data||{};
        if(!data.ok&&!data.already_sent)throw new Error(data.message||'The email provider did not confirm sending the refund email.');
        sellerFeedback('sellerOrdersFeedback',data.already_sent?'Refund email for '+(orderNumber||'this order')+' was already sent.':'Refund email sent to '+String(data.recipient_email||'the customer')+'.','success');
        if(button){button.disabled=true;button.textContent='Refund Email Sent';}
      }catch(error){
        const message=error&&error.message?error.message:'Could not send the refund email.';
        sellerFeedback('sellerOrdersFeedback',message,'error');showToast(message);
        if(button){button.disabled=false;button.textContent='Send Refund Email';}
      }
    }
    async function completeSellerOrderDelivery(orderId,orderNumber,button){
      if(button&&button.disabled){sellerFeedback('sellerOrdersFeedback','Payment must be settled before completing delivery.','error');return;}
      if(!window.confirm('Mark '+(orderNumber||'this order')+' as completed? Payment must already be settled. This manual override will show Order Received to the customer.'))return;
      if(button){button.disabled=true;button.textContent='Completing…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('complete_genmerch_order_delivery',{p_order_id:orderId});
        if(result.error)throw result.error;
        await maybeSendGenmerchDeliverySurveyEmail(client,{order_id:orderId});
        sellerOrdersLoaded=false;
        await loadSellerOrders(true);
        sellerFeedback('sellerOrdersFeedback',(orderNumber||'Order')+' marked as completed.','success');
      }catch(error){
        const message=error&&error.message?error.message:'Could not complete delivery.';
        sellerFeedback('sellerOrdersFeedback',message,'error');
        showToast(message);
        if(button){button.disabled=false;button.textContent='Mark as Completed';}
      }
    }
    async function settleSellerOrderPayment(orderId,orderNumber,button){
      const confirmation='Confirm that GENMERCH has actually received/cleared payment for '+(orderNumber||'this order')+'? Only continue if funds have been received. This marks payment as PAID.';
      if(!window.confirm(confirmation))return;
      if(button){button.disabled=true;button.textContent='Confirming payment…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('settle_genmerch_order_payment',{
          p_order_id:orderId,
          p_note:'Seller Centre admin manually confirmed payment was received'
        });
        if(result.error)throw result.error;
        await maybeSendGenmerchDeliverySurveyEmail(client,{order_id:orderId});
        sellerOrdersLoaded=false;
        await loadSellerOrders(true);
        sellerFeedback('sellerOrdersFeedback',(orderNumber||'Order')+' payment marked as Paid. Delivery completion is now available.','success');
        showToast((orderNumber||'Order')+' payment marked Paid.');
      }catch(error){
        const message=error&&error.message?error.message:'Could not settle this payment.';
        sellerFeedback('sellerOrdersFeedback',message,'error');
        showToast(message);
        if(button){button.disabled=false;button.textContent='Mark Payment Settled';}
      }
    }
        function sellerShipmentSummaryMarkup(shipment){
      if(!shipment||!shipment.courier_name)return '<div class="seller-muted">Courier/reference not recorded.</div>';
      return '<div class="seller-shipment-summary"><span><strong>Courier:</strong> '+sellerEscape(shipment.courier_name)+'</span><span><strong>Ref #:</strong> '+sellerEscape(shipment.tracking_number||'—')+'</span></div>';
    }
    function renderSellerOrders(rows,itemRows=[],shipmentRows=[]){
      sellerOrderFilterSourceRows=Array.isArray(rows)?rows:[];
      sellerOrderFilterSourceItems=Array.isArray(itemRows)?itemRows:[];
      sellerOrderFilterSourceShipments=Array.isArray(shipmentRows)?shipmentRows:[];
      sellerRefreshOrderPaymentMethodOptions();
      sellerApplyOrderFilters();
    }
    function sellerRefreshOrderPaymentMethodOptions(){
      const select=$('sellerOrdersMethodFilter');
      if(!select)return;
      const current=select.value;
      const methods=Array.from(new Set(sellerOrderFilterSourceRows.map(row=>String(row.payment_method||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
      select.innerHTML='<option value="">All payment methods</option>'+methods.map(method=>'<option value="'+sellerEscape(method)+'">'+sellerEscape(method.replace(/_/g,' '))+'</option>').join('');
      select.value=methods.includes(current)?current:'';
    }
    function sellerOrdersFilterChanged(){
      sellerOrdersCurrentPage=1;
      sellerApplyOrderFilters();
    }
    function sellerOrderSortBy(key){
      const allowed=['order_number','customer_name','customer_phone','customer_email','status','payment_status','payment_method','total_amount','shipping_city_municipality','shipping_province','created_at'];
      if(!allowed.includes(key))return;
      if(sellerOrdersSortKey===key)sellerOrdersSortDirection=sellerOrdersSortDirection==='asc'?'desc':'asc';
      else{sellerOrdersSortKey=key;sellerOrdersSortDirection=key==='created_at'||key==='total_amount'?'desc':'asc';}
      sellerOrdersCurrentPage=1;
      sellerApplyOrderFilters();
    }
    function sellerRenderOrdersPagination(totalFilteredRows,totalOrderRows){
      const node=$('sellerOrdersPagination');
      if(!node)return;
      const pageCount=Math.max(1,Math.ceil(totalFilteredRows/SELLER_TABLE_PAGE_SIZE));
      sellerOrdersCurrentPage=Math.min(Math.max(1,sellerOrdersCurrentPage),pageCount);
      if(totalFilteredRows===0){node.innerHTML='<span class="seller-pagination-summary">No matching orders · Total orders: '+totalOrderRows+'</span>';return;}
      const start=(sellerOrdersCurrentPage-1)*SELLER_TABLE_PAGE_SIZE+1,end=Math.min(totalFilteredRows,sellerOrdersCurrentPage*SELLER_TABLE_PAGE_SIZE);
      const buttons=[];
      buttons.push('<button class="seller-pagination-button" type="button" data-order-page="'+(sellerOrdersCurrentPage-1)+'" aria-label="Previous orders page" '+(sellerOrdersCurrentPage===1?'disabled':'')+'>&lsaquo;</button>');
      let pageList=[];
      if(pageCount<=5)pageList=Array.from({length:pageCount},(_,i)=>i+1);
      else{
        pageList=Array.from(new Set([1,Math.max(1,sellerOrdersCurrentPage-1),sellerOrdersCurrentPage,Math.min(pageCount,sellerOrdersCurrentPage+1),pageCount])).sort((a,b)=>a-b);
      }
      pageList.forEach((page,index)=>{
        if(index>0&&page-pageList[index-1]>1)buttons.push('<span class="seller-muted" aria-hidden="true">…</span>');
        buttons.push('<button class="seller-pagination-button'+(page===sellerOrdersCurrentPage?' active':'')+'" type="button" data-order-page="'+page+'" aria-label="Orders page '+page+'" aria-current="'+(page===sellerOrdersCurrentPage?'page':'false')+'">'+page+'</button>');
      });
      buttons.push('<button class="seller-pagination-button" type="button" data-order-page="'+(sellerOrdersCurrentPage+1)+'" aria-label="Next orders page" '+(sellerOrdersCurrentPage===pageCount?'disabled':'')+'>&rsaquo;</button>');
      node.innerHTML='<span class="seller-pagination-summary">Showing '+start+'–'+end+' of '+totalFilteredRows+' matching · Total orders: '+totalOrderRows+'</span>'+buttons.join('');
      node.querySelectorAll('[data-order-page]').forEach(button=>button.addEventListener('click',()=>{
        if(button.disabled)return;
        sellerOrdersCurrentPage=Number(button.dataset.orderPage)||1;
        sellerApplyOrderFilters();
      }));
    }
    function sellerApplyOrderFilters(){
      const query=String($('sellerOrdersSearch')?.value||'').trim().toLowerCase();
      const status=String($('sellerOrdersStatusFilter')?.value||'').toLowerCase();
      const payment=String($('sellerOrdersPaymentFilter')?.value||'').toLowerCase();
      const method=String($('sellerOrdersMethodFilter')?.value||'').toLowerCase();
      const dateWindow=Number($('sellerOrdersDateFilter')?.value||0);
      const cutoff=dateWindow?Date.now()-dateWindow*24*60*60*1000:0;
      const rows=sellerOrderFilterSourceRows.filter(row=>{
        const rowStatus=String(row.status||'pending').toLowerCase();
        const rowPayment=String(row.payment_status||'pending').toLowerCase();
        if(status&&rowStatus!==status)return false;
        if(payment&&rowPayment!==payment)return false;
        if(method&&String(row.payment_method||'').toLowerCase()!==method)return false;
        if(cutoff){const created=Date.parse(row.created_at||'');if(!Number.isFinite(created)||created<cutoff)return false;}
        if(!query)return true;
        const orderId=String(row.id||'');
        const items=sellerOrderFilterSourceItems.filter(item=>String(item.order_id)===orderId);
        const shipment=sellerOrderFilterSourceShipments.find(item=>String(item.order_id)===orderId)||{};
        const searchable=[row.order_number,row.customer_name,row.customer_phone,row.customer_email,row.status,row.payment_status,row.payment_method,row.shipping_street_address,row.shipping_barangay,row.shipping_city_municipality,row.shipping_province,row.shipping_postal_code,row.delivery_zone,shipment.courier_name,shipment.tracking_number,...items.flatMap(item=>[item.product_name,item.sku,item.size_label,item.color_label])];
        return searchable.some(value=>String(value||'').toLowerCase().includes(query));
      });
      rows.sort((a,b)=>{
        const key=sellerOrdersSortKey;
        let result=0;
        if(key==='total_amount')result=(Number(a[key])||0)-(Number(b[key])||0);
        else if(key==='created_at')result=(Date.parse(a[key]||'')||0)-(Date.parse(b[key]||'')||0);
        else result=String(a[key]||'').localeCompare(String(b[key]||''),undefined,{numeric:true,sensitivity:'base'});
        return sellerOrdersSortDirection==='asc'?result:-result;
      });
      const matchingIds=new Set(rows.map(row=>String(row.id)));
      const items=sellerOrderFilterSourceItems.filter(item=>matchingIds.has(String(item.order_id)));
      const shipments=sellerOrderFilterSourceShipments.filter(item=>matchingIds.has(String(item.order_id)));
      const count=$('sellerOrdersFilterCount');
      if(count)count.textContent='Total Orders: '+rows.length+' / '+sellerOrderFilterSourceRows.length;
      sellerRenderOrdersTable(rows,items,shipments,Boolean(query||status||payment||method||dateWindow));
    }
    function sellerRenderOrdersTable(rows,itemRows=[],shipmentRows=[],filtered=false){
      const head=$('sellerOrdersTableHead'),body=$('sellerOrdersTableBody');
      const columns=[['Order','order_number'],['Customer','customer_name'],['Contact','customer_phone'],['Email','customer_email'],['Status','status'],['Payment','payment_status'],['Method','payment_method'],['Total','total_amount'],['Delivery','shipping_street_address'],['City','shipping_city_municipality'],['Province','shipping_province'],['Date','created_at'],['Items','__items'],['Action','__action']];
      const sortableOrderColumns=new Set(['order_number','customer_name','customer_phone','customer_email','status','payment_status','payment_method','total_amount','shipping_city_municipality','shipping_province','created_at']);
      head.innerHTML='<tr>'+columns.map(col=>{
        if(!sortableOrderColumns.has(col[1]))return '<th>'+sellerEscape(col[0])+'</th>';
        const active=sellerOrdersSortKey===col[1],arrow=active?(sellerOrdersSortDirection==='asc'?'↑':'↓'):'↕';
        return '<th><button class="seller-sort-button" type="button" data-seller-order-sort="'+col[1]+'">'+sellerEscape(col[0])+' <span aria-hidden="true">'+arrow+'</span></button></th>';
      }).join('')+'</tr>';
      head.querySelectorAll('[data-seller-order-sort]').forEach(button=>button.addEventListener('click',()=>sellerOrderSortBy(button.dataset.sellerOrderSort)));
      const totalFilteredRows=rows.length;
      const pageCount=Math.max(1,Math.ceil(totalFilteredRows/SELLER_TABLE_PAGE_SIZE));
      sellerOrdersCurrentPage=Math.min(Math.max(1,sellerOrdersCurrentPage),pageCount);
      const displayStart=(sellerOrdersCurrentPage-1)*SELLER_TABLE_PAGE_SIZE;
      const displayRows=rows.slice(displayStart,displayStart+SELLER_TABLE_PAGE_SIZE);
      const visibleCount=$('sellerOrdersFilterCount');
      if(visibleCount)visibleCount.textContent=totalFilteredRows?'Showing '+(displayStart+1)+'–'+Math.min(totalFilteredRows,displayStart+displayRows.length)+' · Total Orders: '+sellerOrderFilterSourceRows.length:'Total Orders: 0';
      sellerRenderOrdersPagination(totalFilteredRows,sellerOrderFilterSourceRows.length);
      if(!totalFilteredRows){body.innerHTML='<tr><td colspan="'+columns.length+'" class="seller-table-empty">'+(filtered?'No orders match these filters. Select Clear to show all orders.':'No orders have been placed yet. Customer checkout orders will appear here automatically.')+'</td></tr>';return;}
      const itemsByOrder=new Map(),shipmentsByOrder=new Map();
      (itemRows||[]).forEach(item=>{const key=String(item.order_id);if(!itemsByOrder.has(key))itemsByOrder.set(key,[]);itemsByOrder.get(key).push(item);});
      (shipmentRows||[]).forEach(shipment=>{if(!shipmentsByOrder.has(String(shipment.order_id)))shipmentsByOrder.set(String(shipment.order_id),shipment);});
      body.innerHTML=displayRows.map(row=>{
        const items=itemsByOrder.get(String(row.id))||[];
        const itemUnits=items.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity)||0),0);
        const mainRow='<tr data-seller-order-row="'+sellerEscape(row.id)+'">'+columns.map(col=>{
          if(col[1]==='__items')return '<td><button class="seller-secondary-button seller-order-items-toggle" type="button" data-seller-order-items="'+sellerEscape(row.id)+'" aria-expanded="false">View '+items.length+' item(s)</button><div class="seller-muted">'+itemUnits+' unit(s)</div></td>';
          if(col[1]==='__action'){
            const status=String(row.status||'').toLowerCase(),step=SELLER_ORDER_NEXT_STEP[status];
            const paymentStatus=String(row.payment_status||'pending').toLowerCase();
            const paymentSettled=paymentStatus==='paid';
            const shipment=shipmentsByOrder.get(String(row.id))||null;
            const orderId=sellerEscape(row.id),orderNumber=sellerEscape(row.order_number||'');
            const canCancel=['pending','confirmed','processing'].includes(status)&&!Boolean(row.inventory_released);
            const cancel=canCancel?'<button class="seller-danger-button" type="button" data-seller-cancel-order data-order-id="'+orderId+'" data-order-number="'+orderNumber+'">Cancel order</button>':'';
            const deleteTestDemo='<button class="seller-danger-button seller-order-delete-test-button" type="button" data-seller-delete-test-order data-order-id="'+orderId+'" data-order-number="'+orderNumber+'" title="For test/demo or erroneous orders only">Delete (test/demo)</button>';
            const waybillEligible=['processing','shipped','out_for_delivery','delivered'].includes(status);
            const waybillSelected=waybillEligible&&Boolean(window.GM_WAYBILL_SELECTED_ORDER_IDS&&window.GM_WAYBILL_SELECTED_ORDER_IDS.has(String(row.id)));
            const waybillAction=waybillEligible
              ?'<div class="gm-waybill-row-actions"><label class="gm-waybill-select"><input type="checkbox" data-seller-waybill-select data-order-id="'+orderId+'" aria-label="Select '+orderNumber+' for the 4-in-1 waybill sheet"'+(waybillSelected?' checked':'')+'><span>4-up</span></label><button class="seller-secondary-button gm-waybill-preview-button" type="button" data-seller-waybill-preview data-order-id="'+orderId+'" data-order-number="'+orderNumber+'">Preview Waybill</button></div>'
              :'';

            const canSettlePayment=!paymentSettled&&!['cancelled','refunded'].includes(status)&&!['cancelled','refunded'].includes(paymentStatus);
            const settlePayment=canSettlePayment
              ?'<button class="seller-warning-button" type="button" data-seller-settle-payment data-order-id="'+orderId+'" data-order-number="'+orderNumber+'">Mark Payment Settled</button><div class="seller-payment-gate-note">Only mark Paid after funds are actually received.</div>'
              :'';
            const canSendRefundEmail=status==='refunded'||paymentStatus==='refunded';
            const refundEmail=canSendRefundEmail
              ?'<button class="seller-secondary-button" type="button" data-seller-send-refund-email data-order-id="'+orderId+'" data-order-number="'+orderNumber+'">Send Refund Email</button>'
              :'';
            const completeButton='<button class="seller-primary-button" type="button" data-seller-complete-order data-order-id="'+orderId+'" data-order-number="'+orderNumber+'"'+(paymentSettled?'':' disabled title="Payment must be settled before completion" aria-disabled="true"')+'>Mark as Completed</button>';
            let action='';
            if(status==='processing'){
              const courierOptions=GENMERCH_SHIPPING_COURIERS.map(courier=>'<option value="'+sellerEscape(courier)+'"'+(shipment&&shipment.courier_name===courier?' selected':'')+'>'+sellerEscape(courier)+'</option>').join('');
              action='<div class="seller-shipping-setup" data-shipping-order="'+orderId+'">'+
                '<label>Courier<select data-seller-courier aria-label="Select courier for '+orderNumber+'"><option value="">Select courier</option>'+courierOptions+'</select></label>'+
                '<label>Delivery Reference #<input type="text" data-seller-reference maxlength="100" placeholder="Enter reference #" value="'+sellerEscape(shipment&&shipment.tracking_number||'')+'" aria-label="Delivery reference for '+orderNumber+'"></label>'+
                '<button class="seller-primary-button" type="button" data-seller-mark-shipped data-order-id="'+orderId+'" data-order-number="'+orderNumber+'">Mark as Shipped</button></div>';
            }else if(status==='shipped'){
              action=sellerShipmentSummaryMarkup(shipment)+
                '<button class="seller-secondary-button" type="button" data-seller-advance-order data-order-id="'+orderId+'" data-order-number="'+orderNumber+'" data-next-status="out_for_delivery">Mark Out for Delivery</button>'+
                completeButton;
            }else if(status==='out_for_delivery'){
              action=sellerShipmentSummaryMarkup(shipment)+completeButton;
            }else if(status==='delivered'){
              action=paymentSettled
                ?'<span class="seller-muted">Order received</span>'
                :'<span class="seller-payment-gate-note">Delivery was marked complete while payment is still pending. Confirm payment receipt to resolve this order.</span>';
            }else if(step){
              action='<button class="seller-primary-button seller-order-advance-button" type="button" data-seller-advance-order data-order-id="'+orderId+'" data-order-number="'+orderNumber+'" data-next-status="'+sellerEscape(step.next)+'">'+sellerEscape(step.label)+'</button>';
            }else{
              action='<span class="seller-muted">'+sellerEscape(status==='cancelled'?'Cancelled':(status==='refunded'?'Refunded':'Complete'))+'</span>';
            }
            return '<td><div class="seller-order-actions seller-order-actions-shipping">'+action+waybillAction+settlePayment+refundEmail+cancel+deleteTestDemo+'</div></td>';
          }
          let value=row[col[1]],display=value===null||value===undefined||value===''?'—':String(value);
          if(col[1]==='status'){
            const normalizedOrderStatus=String(value||'pending').toLowerCase();
            const normalizedPaymentStatus=String(row.payment_status||'pending').toLowerCase();
            if(normalizedOrderStatus==='delivered'&&normalizedPaymentStatus!=='paid'){
              return '<td><span class="seller-order-status-payment-pending">Completed · Payment Pending</span></td>';
            }
            display=sellerOrderStatusLabel(value);
          }
          if(col[1]==='total_amount')display=money(value);
          if(col[1]==='created_at')display=sellerDate(value);
          if(col[1]==='payment_status'){
            const normalizedPayment=String(value||'pending').toLowerCase();
            const paid=normalizedPayment==='paid';
            return '<td><span class="seller-payment-status-pill '+(paid?'paid':'pending')+'">'+sellerEscape(paid?'Paid':normalizedPayment.replace(/_/g,' '))+'</span></td>';
          }
          return '<td><div class="seller-order-value">'+sellerEscape(display)+'</div></td>';
        }).join('')+'</tr>';
        const itemsMarkup=items.length?items.map(item=>{
          const imageUrl=safeCatalogImageUrl(item.image_url_snapshot);
          const image=imageUrl?'<img class="seller-order-item-image" src="'+sellerEscape(imageUrl)+'" alt="'+sellerEscape(item.product_name||'Product image')+'" loading="lazy" decoding="async">':'<div class="seller-order-item-image seller-order-item-placeholder">👕</div>';
          return '<article class="seller-order-item-card">'+image+'<div class="seller-order-item-info"><strong>'+sellerEscape(item.product_name||'Deleted product')+'</strong><span>SKU: '+sellerEscape(item.sku||'—')+'</span><span>Size: '+sellerEscape(item.size_label||'—')+(item.color_label?' · Color: '+sellerEscape(item.color_label):'')+'</span><span>Qty: '+sellerEscape(item.quantity)+'</span></div><div class="seller-order-item-price"><strong>'+sellerEscape(money(item.line_total))+'</strong><span>'+sellerEscape(money(item.unit_price))+' each</span></div></article>';
        }).join(''):'<p class="seller-muted">No order item lines were returned for this order.</p>';
        const shipment=shipmentsByOrder.get(String(row.id))||null;
        const shipmentDetails=shipment&&shipment.courier_name?'<div class="seller-order-address"><strong>Courier:</strong> '+sellerEscape(shipment.courier_name)+' · <strong>Delivery Reference #:</strong> '+sellerEscape(shipment.tracking_number||'—')+' · <strong>Shipment status:</strong> '+sellerEscape(shipment.status||'—')+'</div>':'';
        const detailRow='<tr class="seller-order-detail-row" data-seller-order-detail="'+sellerEscape(row.id)+'" hidden><td colspan="'+columns.length+'"><div class="seller-order-items-panel">'+itemsMarkup+'<div class="seller-order-address"><strong>Full delivery address:</strong> '+sellerEscape([row.shipping_street_address,row.shipping_barangay,row.shipping_city_municipality,row.shipping_province,row.shipping_postal_code].filter(Boolean).join(', '))+(row.shipping_landmark?'<br><strong>Landmark:</strong> '+sellerEscape(row.shipping_landmark):'')+(row.delivery_instructions?'<br><strong>Instructions:</strong> '+sellerEscape(row.delivery_instructions):'')+'<br><strong>Subtotal:</strong> '+sellerEscape(money(row.subtotal))+' · <strong>Delivery:</strong> '+sellerEscape(money(row.shipping_fee))+' '+(row.delivery_zone?'('+sellerEscape(row.delivery_zone)+')':'')+'</div>'+shipmentDetails+'</div></td></tr>';
        return mainRow+detailRow;
      }).join('');
      body.querySelectorAll('[data-seller-order-items]').forEach(button=>button.addEventListener('click',()=>{
        const detail=body.querySelector('[data-seller-order-detail="'+button.dataset.sellerOrderItems+'"]');
        if(!detail)return;
        detail.hidden=!detail.hidden;
        button.setAttribute('aria-expanded',String(!detail.hidden));
        const rowItems=itemsByOrder.get(String(button.dataset.sellerOrderItems))||[];
        button.textContent=(detail.hidden?'View ':'Hide ')+rowItems.length+' item(s)';
      }));
      body.querySelectorAll('[data-seller-cancel-order]').forEach(button=>button.addEventListener('click',()=>cancelSellerOrder(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-delete-test-order]').forEach(button=>button.addEventListener('click',()=>deleteSellerTestDemoOrder(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-advance-order]').forEach(button=>button.addEventListener('click',()=>advanceSellerOrderStatus(button.dataset.orderId,button.dataset.orderNumber,button.dataset.nextStatus,button)));
      body.querySelectorAll('[data-seller-mark-shipped]').forEach(button=>button.addEventListener('click',()=>markSellerOrderShipped(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-complete-order]').forEach(button=>button.addEventListener('click',()=>completeSellerOrderDelivery(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-settle-payment]').forEach(button=>button.addEventListener('click',()=>settleSellerOrderPayment(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-send-refund-email]').forEach(button=>button.addEventListener('click',()=>sendSellerRefundEmail(button.dataset.orderId,button.dataset.orderNumber,button)));
      body.querySelectorAll('[data-seller-waybill-select]').forEach(input=>input.addEventListener('change',()=>{
        const selected=window.GM_WAYBILL_SELECTED_ORDER_IDS;
        const orderId=String(input.dataset.orderId||'');
        if(!selected||!orderId)return;
        if(input.checked){
          if(selected.size>=4){input.checked=false;sellerFeedback('sellerOrdersFeedback','A 4-in-1 sheet holds up to 4 orders. Print or clear the current selection first.','error');return;}
          selected.add(orderId);
        }else selected.delete(orderId);
        sellerRefreshWaybillQueueUI();
      }));
      body.querySelectorAll('[data-seller-waybill-preview]').forEach(button=>button.addEventListener('click',()=>sellerOpenWaybillPreview(button.dataset.orderId)));
      sellerRefreshWaybillQueueUI();
    }
    async function loadSellerOrders(silent=false){
      if(!sellerCentreIsUnlocked)return;
      if(!silent)sellerSetLoadingRow('sellerOrdersTableBody',14,'Loading orders from Supabase…');
      sellerFeedback('sellerOrdersFeedback','','');
      try{
        const client=await getSellerAdminClient();
        const result=await client.from('orders').select('id,order_number,customer_name,customer_phone,customer_email,status,payment_status,payment_method,total_amount,subtotal,shipping_fee,shipping_street_address,shipping_barangay,shipping_city_municipality,shipping_province,shipping_postal_code,shipping_landmark,delivery_instructions,delivery_zone,created_at,inventory_reserved,inventory_released,cancellation_reason').order('created_at',{ascending:false}).limit(200);
        if(result.error)throw result.error;
        const rows=Array.isArray(result.data)?result.data:[];
        let itemRows=[],shipmentRows=[];
        if(rows.length){
          const orderIds=rows.map(row=>row.id);
          const [itemResult,shipmentResult]=await Promise.all([
            client.from('order_items').select('id,order_id,product_id,variant_id,product_name,sku,size_label,color_label,unit_price,quantity,line_total,image_url_snapshot,created_at').in('order_id',orderIds).order('created_at',{ascending:true}),
            client.from('shipments').select('id,order_id,courier_name,tracking_number,tracking_url,status,shipped_at,delivered_at,updated_at').in('order_id',orderIds).order('updated_at',{ascending:false})
          ]);
          if(itemResult.error)throw itemResult.error;
          if(shipmentResult.error)throw shipmentResult.error;
          itemRows=Array.isArray(itemResult.data)?itemResult.data:[];
          shipmentRows=Array.isArray(shipmentResult.data)?shipmentResult.data:[];
        }
        renderSellerOrders(rows,itemRows,shipmentRows);sellerOrdersLoaded=true;
      }catch(error){
        if(!silent)sellerSetLoadingRow('sellerOrdersTableBody',14,'Orders could not be loaded.');
        sellerFeedback('sellerOrdersFeedback',error.message||'Could not load orders and items. Check order_items admin SELECT permission.','error');sellerOrdersLoaded=false;
      }
    }
    async function cancelSellerOrder(orderId,orderNumber,button){
      const displayNumber=orderNumber||orderId;
      if(!window.confirm('Cancel order '+displayNumber+'? If stock was reserved, the database will return it once and record the movement. Shipped/delivered orders must use a returns workflow.'))return;
      if(button){button.disabled=true;button.textContent='Cancelling…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('cancel_genmerch_order',{p_order_id:orderId,p_reason:'Cancelled by Seller Centre administrator'});
        if(result.error)throw result.error;
        let cancellationEmailStatus=' Cancellation email sent to the customer.';
        try{
          const emailResponse=await client.functions.invoke('send-genmerch-cancellation-email',{body:{order_id:orderId}});
          if(emailResponse.error)throw emailResponse.error;
          const emailData=emailResponse.data||{};
          if(!emailData.ok)throw new Error(emailData.message||'The email provider did not confirm sending the cancellation email.');
          if(emailData.already_sent)cancellationEmailStatus=' Cancellation email had already been sent.';
        }catch(emailError){
          console.error('Order was cancelled, but cancellation email status could not be confirmed.',emailError);
          cancellationEmailStatus=' The order is cancelled, but the cancellation email could not be confirmed. Check the email notification status before retrying.';
        }
        sellerOrdersLoaded=false;sellerInventoryLoaded=false;
        await loadSellerOrders();
        await loadSellerInventoryAnalytics();
        await loadSellerProducts();
        await loadSupabaseCatalog();renderCategoryFilters();renderProducts();
        sellerFeedback('sellerOrdersFeedback','Order '+displayNumber+' cancelled. Reserved stock has been returned by the database trigger, if applicable.'+cancellationEmailStatus,cancellationEmailStatus.includes('could not be confirmed')?'error':'success');
      }catch(error){
        sellerFeedback('sellerOrdersFeedback',error.message||'Could not cancel this order.','error');
        if(button){button.disabled=false;button.textContent='Cancel order';}
      }
    }

    async function deleteSellerTestDemoOrder(orderId,orderNumber,button){
      const displayNumber=String(orderNumber||'').trim();
      if(!orderId||!displayNumber){
        sellerFeedback('sellerOrdersFeedback','Order details are missing. Refresh Orders and try again.','error');
        return;
      }
      const typedNumber=window.prompt(
        'TEST/DEMO CLEANUP ONLY. This permanently removes the live order and its linked customer order history. If stock is still reserved, the database will restore it once. Successful external payments cannot be deleted.\\n\\nTo continue, type this exact order number: '+displayNumber
      );
      if(typedNumber===null)return;
      if(typedNumber.trim()!==displayNumber){
        sellerFeedback('sellerOrdersFeedback','Order number did not match. No changes were made.','error');
        return;
      }
      if(!window.confirm('FINAL CHECK: Delete TEST/DEMO order '+displayNumber+'? Do not use this for a genuine customer order. This action cannot be undone.')){
        return;
      }
      if(button){button.disabled=true;button.textContent='Deleting…';}
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('delete_genmerch_order',{
          p_order_id:orderId,
          p_confirmation_order_number:displayNumber,
          p_reason:'Test/demo or erroneous order removed via Seller Centre after exact order-number confirmation'
        });
        if(result.error)throw result.error;
        const deleted=Array.isArray(result.data)?result.data[0]:(result.data||{});
        sellerOrdersLoaded=false;sellerInventoryLoaded=false;
        await loadSellerOrders();
        await loadSellerInventoryAnalytics();
        await loadSellerProducts();
        await loadSupabaseCatalog();renderCategoryFilters();renderProducts();
        sellerFeedback(
          'sellerOrdersFeedback',
          'Test/demo order '+displayNumber+' deleted. '+(Number(deleted.restored_stock_units)||0)+' stock unit(s) restored; '+(Number(deleted.deleted_item_count)||0)+' order item(s) removed. An admin audit record was retained.',
          'success'
        );
      }catch(error){
        sellerFeedback('sellerOrdersFeedback',error.message||'Could not delete this test/demo order. No successful deletion was confirmed.','error');
        if(button){button.disabled=false;button.textContent='Delete (test/demo)';}
      }
    }
    function sellerSetDashboardCollapsed(collapsed){
      const isCollapsed=Boolean(collapsed),grid=$('sellerInventoryMetrics'),collapseButton=$('sellerCollapseDashboardButton'),expandButton=$('sellerExpandDashboardButton');
      if(!grid)return;
      grid.hidden=isCollapsed;
      grid.setAttribute('aria-hidden',String(isCollapsed));
      if(collapseButton){collapseButton.disabled=isCollapsed;collapseButton.setAttribute('aria-expanded',String(!isCollapsed));}
      if(expandButton){expandButton.disabled=!isCollapsed;expandButton.setAttribute('aria-expanded',String(isCollapsed));}
    }
    function sellerToggleSection(sectionId,button){
      const section=$(sectionId);
      if(!section||!button)return;
      const collapseNow=!section.hidden;
      section.hidden=collapseNow;
      section.setAttribute('aria-hidden',String(collapseNow));
      button.setAttribute('aria-expanded',String(!collapseNow));
      button.textContent=(collapseNow?'＋ ':'− ')+(collapseNow?(button.dataset.expandLabel||'Expand Section'):(button.dataset.collapseLabel||'Collapse Section'));
    }
    function sellerInventoryMoney(value){return money(Number(value)||0);}
    function sellerRenderInventoryMetrics(products,variants,orders){
      const productMap=new Map(products.map(product=>[String(product.id),product]));
      const activeProducts=products.filter(product=>product.is_active!==false);
      const activeVariants=variants.filter(variant=>variant.is_active!==false&&productMap.has(String(variant.product_id))&&productMap.get(String(variant.product_id)).is_active!==false);
      const totalUnits=activeVariants.reduce((sum,variant)=>sum+Math.max(0,Number(variant.stock_quantity)||0),0);
      const lowStock=activeVariants.filter(variant=>Number(variant.stock_quantity)>0&&Number(variant.stock_quantity)<=5).length;
      const outOfStock=activeVariants.filter(variant=>Number(variant.stock_quantity)<=0).length;
      const stockValue=activeVariants.reduce((sum,variant)=>{const product=productMap.get(String(variant.product_id));return sum+Math.max(0,Number(variant.stock_quantity)||0)*Math.max(0,Number(variant.price_override==null?product.base_price:variant.price_override)||0);},0);
      const validPaidOrders=orders.filter(order=>order.payment_status==='paid'&&!['cancelled','refunded'].includes(String(order.status||'').toLowerCase()));
      const paidSales=validPaidOrders.reduce((sum,order)=>sum+Math.max(0,Number(order.total_amount)||0),0);
      const cards=[
        ['Active products',activeProducts.length,'Currently active products'],
        ['Sellable variants',activeVariants.length,'Active size/color variants'],
        ['Units on hand',totalUnits.toLocaleString('en-PH'),'Units across active variants'],
        ['Low stock',lowStock,'1–5 units remaining'],
        ['Out of stock',outOfStock,'Active variants with zero stock'],
        ['Stock value (retail)',sellerInventoryMoney(stockValue),'Retail price × on-hand quantity'],
        ['Orders received',orders.length,'All recorded orders'],
        ['Paid sales',sellerInventoryMoney(paidSales),'Paid, non-cancelled/refunded orders']
      ];
      const metricIcons=[
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 1.9-1.5L22 8H6"/><circle cx="10" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 3 10V3h7l10 10Z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16.5h.01"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 10v5c0 1.7 3.6 3 8 3 1.4 0 2.7-.1 3.8-.4M4 15v4c0 1.7 3.6 3 8 3"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5M8 12h8M8 16h8"/></svg>',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"/><path d="M2 9h20M15 14h3"/><path d="M11 3v3"/></svg>'
      ];
      $('sellerInventoryMetrics').innerHTML=cards.map((card,index)=>'<div class="seller-metric-card"><span class="seller-metric-icon" aria-hidden="true">'+metricIcons[index]+'</span><div class="seller-metric-copy"><span class="seller-metric-label">'+sellerEscape(card[0])+'</span><strong class="seller-metric-value">'+sellerEscape(card[1])+'</strong><span class="seller-metric-detail">'+sellerEscape(card[2])+'</span></div></div>').join('');
    }
    function sellerSetInventoryFilterOptions(products,variants){
      const categorySelect=$('sellerInventoryCategoryFilter'),variantSelect=$('sellerInventoryVariantFilter');
      if(categorySelect){
        const current=categorySelect.value,categoryMap=new Map();
        (products||[]).forEach(product=>{
          const id=String(product.category_id||'');
          if(!id)return;
          const category=sellerCategories.find(item=>String(item.id)===id);
          categoryMap.set(id,category&&category.name?category.name:'Other');
        });
        const options=Array.from(categoryMap.entries()).sort((a,b)=>a[1].localeCompare(b[1]));
        categorySelect.innerHTML='<option value="">All categories</option>'+options.map(([id,name])=>'<option value="'+sellerEscape(id)+'">'+sellerEscape(name)+'</option>').join('');
        categorySelect.value=categoryMap.has(current)?current:'';
      }
      if(variantSelect){
        const current=variantSelect.value,variantMap=new Map();
        (variants||[]).forEach(variant=>{
          const size=String(variant.size_label||'Variant'),color=String(variant.color_label||''),key=JSON.stringify([size,color]);
          variantMap.set(key,size+(color?' / '+color:''));
        });
        const options=Array.from(variantMap.entries()).sort((a,b)=>a[1].localeCompare(b[1]));
        variantSelect.innerHTML='<option value="">All variants</option>'+options.map(([key,label])=>'<option value="'+sellerEscape(key)+'">'+sellerEscape(label)+'</option>').join('');
        variantSelect.value=variantMap.has(current)?current:'';
      }
    }
    function sellerInventorySortBy(key){
      const allowed=['product','variant','price','stock','status'];
      if(!allowed.includes(key))return;
      if(sellerInventorySortKey===key)sellerInventorySortDirection=sellerInventorySortDirection==='asc'?'desc':'asc';
      else{sellerInventorySortKey=key;sellerInventorySortDirection=key==='stock'||key==='price'?'desc':'asc';}
      sellerRenderInventoryRows();
    }
    function sellerInventoryThumbMarkup(productId,productName,colorLabel){
      const rows=sellerImageRowsByProductId.get(String(productId))||[];
      const requestedColor=sellerNormalizeColorLabel(colorLabel);
      // Color variants use the gallery photo explicitly linked to that color.
      const image=requestedColor
        ?rows.find(row=>sellerNormalizeColorLabel(row.color_label)===requestedColor)
        :(rows.find(row=>row.is_primary)||rows[0]);
      const url=image?safeCatalogImageUrl(image.image_url):'';
      const imageLabel=(productName||'Product')+(requestedColor?' — '+requestedColor:'')+' photo';
      if(url)return '<button class="seller-inventory-image-button" type="button" data-genmerch-seller-image-viewer="true" data-image-url="'+sellerEscape(url)+'" data-image-alt="'+sellerEscape(imageLabel)+'" aria-label="Open larger image: '+sellerEscape(imageLabel)+'" title="Click to view larger image"><img class="seller-inventory-product-thumb" src="'+sellerEscape(url)+'" alt="'+sellerEscape(imageLabel)+'" loading="lazy" decoding="async"></button>';
      const fallbackTitle=requestedColor?'No gallery photo linked to '+requestedColor+'. Check the product photo color label.':'No product photo available.';
      return '<span class="seller-inventory-product-thumb seller-inventory-product-thumb-fallback" title="'+sellerEscape(fallbackTitle)+'" aria-label="'+sellerEscape(fallbackTitle)+'">👕</span>';
    }
    function sellerRenderInventoryRows(){
      const query=String($('sellerInventorySearch').value||'').trim().toLowerCase();
      const categoryFilter=String($('sellerInventoryCategoryFilter')?.value||'');
      const variantFilter=String($('sellerInventoryVariantFilter')?.value||'');
      const statusFilter=String($('sellerInventoryStatusFilter')?.value||'');
      const tbody=$('sellerInventoryTableBody');
      const rows=sellerInventoryRows.filter(item=>{
        const product=item.product||{},variant=item.variant||{},stock=Math.max(0,Number(variant.stock_quantity)||0);
        const matchesQuery=!query||[product.name,variant.sku,variant.size_label,variant.color_label].some(value=>String(value||'').toLowerCase().includes(query));
        const matchesCategory=!categoryFilter||String(product.category_id||'')===categoryFilter;
        const variantKey=JSON.stringify([String(variant.size_label||'Variant'),String(variant.color_label||'')]);
        const matchesVariant=!variantFilter||variantKey===variantFilter;
        const sellable=product.is_active!==false&&variant.is_active!==false;
        const currentStatus=!sellable?'inactive':stock===0?'out_of_stock':stock<=5?'low_stock':'in_stock';
        const matchesStatus=!statusFilter||currentStatus===statusFilter;
        return matchesQuery&&matchesCategory&&matchesVariant&&matchesStatus;
      });
      rows.sort((a,b)=>{
        const ap=a.product||{},av=a.variant||{},bp=b.product||{},bv=b.variant||{};
        let result=0;
        if(sellerInventorySortKey==='product')result=String(ap.name||'').localeCompare(String(bp.name||''),undefined,{numeric:true,sensitivity:'base'});
        else if(sellerInventorySortKey==='variant')result=String((av.size_label||'')+' '+(av.color_label||'')+' '+(av.sku||'')).localeCompare(String((bv.size_label||'')+' '+(bv.color_label||'')+' '+(bv.sku||'')),undefined,{numeric:true,sensitivity:'base'});
        else if(sellerInventorySortKey==='price')result=(Number(av.price_override==null?ap.base_price:av.price_override)||0)-(Number(bv.price_override==null?bp.base_price:bv.price_override)||0);
        else if(sellerInventorySortKey==='stock')result=(Number(av.stock_quantity)||0)-(Number(bv.stock_quantity)||0);
        else{
          const rank=item=>{const product=item.product||{},variant=item.variant||{},stock=Math.max(0,Number(variant.stock_quantity)||0);return product.is_active===false||variant.is_active===false?0:stock===0?1:stock<=5?2:3;};
          result=rank(a)-rank(b);
        }
        return sellerInventorySortDirection==='asc'?result:-result;
      });
      const totalRows=rows.length;
      const displayRows=rows;
      const count=$('sellerInventoryFilterCount');
      if(count)count.textContent='Total Products: '+totalRows;
      const thead=document.querySelector('.seller-inventory-table thead');
      if(thead)thead.querySelectorAll('[data-inventory-sort]').forEach(button=>{
        const key=button.dataset.inventorySort,span=button.querySelector('span');
        if(span)span.textContent=sellerInventorySortKey===key?(sellerInventorySortDirection==='asc'?'↑':'↓'):'↕';
      });
      const anyFilter=Boolean(query||categoryFilter||variantFilter||statusFilter);
      if(!rows.length){tbody.innerHTML='<tr><td colspan="7" class="seller-table-empty">'+(anyFilter?'No inventory variants match these filters. Select Clear to show all variants.':'No product variants were found.')+'</td></tr>';return;}
      const deleteActionProducts=new Set();
      tbody.innerHTML=displayRows.map(item=>{
        const product=item.product||{},variant=item.variant||{},stock=Math.max(0,Number(variant.stock_quantity)||0);
        const productId=String(product.id||variant.product_id||'');
        const showDelete=Boolean(productId)&&!deleteActionProducts.has(productId);
        if(showDelete)deleteActionProducts.add(productId);
        const sellable=product.is_active!==false&&variant.is_active!==false;
        const status=!sellable?'<span class="seller-status-pill inactive">Inactive</span>':stock===0?'<span class="seller-status-pill out-of-stock">Out of stock</span>':stock<=5?'<span class="seller-status-pill low-stock">Low stock</span>':'<span class="seller-status-pill in-stock">In stock</span>';
        const unitPrice=variant.price_override==null?product.base_price:variant.price_override;
        const deleteButton=showDelete?'<button class="seller-danger-button seller-inventory-delete-button" type="button" data-seller-inventory-delete="'+sellerEscape(productId)+'" aria-label="Permanently delete '+sellerEscape(product.name||'product')+'">DELETE</button>':'<span class="seller-muted">—</span>';
        const productName=product.name||'Unknown product';
        const thumb=sellerInventoryThumbMarkup(productId,productName,variant.color_label);
        return '<tr data-stock-row="'+sellerEscape(variant.id)+'"><td><div class="seller-inventory-product-cell">'+thumb+'<div class="seller-inventory-product-copy"><div class="seller-product-name">'+sellerEscape(productName)+'</div><div class="seller-muted">'+sellerEscape((sellerCategories.find(category=>String(category.id)===String(product.category_id))||{}).name||'Category unavailable')+'</div>'+(product.is_active===false?'<div class="seller-muted">Inactive product</div>':'')+'</div></div></td><td><strong>'+sellerEscape(variant.size_label||'Variant')+(variant.color_label?' / '+sellerEscape(variant.color_label):'')+'</strong><div class="seller-muted">SKU: '+sellerEscape(variant.sku||'—')+'</div></td><td>'+sellerEscape(money(unitPrice))+'</td><td><span class="seller-stock-count">'+stock+'</span> unit(s)</td><td>'+status+'</td><td><div class="seller-stock-actions"><input class="seller-stock-input" type="number" min="1" max="1000000" step="1" value="1" aria-label="Stock quantity adjustment" data-stock-quantity><button class="seller-primary-button" type="button" data-stock-adjust="add" data-variant-id="'+sellerEscape(variant.id)+'">＋ Add</button><button class="seller-secondary-button" type="button" data-stock-adjust="remove" data-variant-id="'+sellerEscape(variant.id)+'" '+(stock===0?'disabled':'')+'>− Remove</button></div></td><td>'+deleteButton+'</td></tr>';
      }).join('');
      tbody.querySelectorAll('[data-stock-adjust]').forEach(button=>button.addEventListener('click',()=>handleSellerStockAdjustment(button)));
      tbody.querySelectorAll('[data-seller-inventory-delete]').forEach(button=>button.addEventListener('click',()=>handleSellerProductAction(button.dataset.sellerInventoryDelete,'delete','sellerInventoryFeedback')));
    }
    function sellerRenderMovements(movements,variants,products,orders){
      const tbody=$('sellerMovementTableBody'),variantMap=new Map(variants.map(item=>[String(item.id),item])),productMap=new Map(products.map(item=>[String(item.id),item])),orderMap=new Map(orders.map(item=>[String(item.id),item]));
      if(!movements.length){tbody.innerHTML='<tr><td colspan="6" class="seller-table-empty">No stock movements yet. Manual adjustments, order deductions, and cancellation returns will appear here.</td></tr>';return;}
      tbody.innerHTML=movements.map(movement=>{
        const variant=variantMap.get(String(movement.variant_id))||{},product=productMap.get(String(variant.product_id))||{},order=orderMap.get(String(movement.order_id))||{};
        const productName=product.name||movement.product_name_snapshot||'Deleted product';
        const sizeName=variant.size_label||movement.size_label_snapshot||'Variant';
        const colorName=variant.color_label||movement.color_label_snapshot||'';
        const sku=variant.sku||movement.variant_sku_snapshot||'';
        const kind=String(movement.movement_type||'adjustment'),delta=Number(movement.quantity_delta)||0,change=(delta>0?'+':'')+delta;
        const reference=[movement.reason,order.order_number?'Order '+order.order_number:''].filter(Boolean).join(' · ');
        return '<tr><td>'+sellerEscape(sellerDate(movement.created_at))+'</td><td><strong>'+sellerEscape(productName)+'</strong><div class="seller-muted">'+sellerEscape(sizeName)+(colorName?' / '+sellerEscape(colorName):'')+(sku?'<br>SKU: '+sellerEscape(sku):'')+'</div></td><td><span class="seller-movement-kind '+sellerEscape(kind)+'">'+sellerEscape(kind.replace(/_/g,' '))+'</span></td><td><strong>'+sellerEscape(change)+'</strong></td><td>'+sellerEscape(movement.stock_before)+' → '+sellerEscape(movement.stock_after)+'</td><td><div class="seller-order-value">'+sellerEscape(reference)+'</div></td></tr>';
      }).join('');
    }
    async function sellerEnsureXlsxLibrary(){
      if(window.XLSX)return window.XLSX;
      if(sellerExportXlsxLoadingPromise)return sellerExportXlsxLoadingPromise;
      sellerExportXlsxLoadingPromise=new Promise((resolve,reject)=>{
        const existing=document.querySelector('script[data-genmerch-xlsx]');
        if(existing){
          existing.addEventListener('load',()=>window.XLSX?resolve(window.XLSX):reject(new Error('Excel library did not initialize.')),{once:true});
          existing.addEventListener('error',()=>reject(new Error('Could not load the Excel export library. Check your internet connection and try again.')),{once:true});
          if(window.XLSX)resolve(window.XLSX);
          return;
        }
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.async=true;
        script.dataset.genmerchXlsx='true';
        script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Excel library did not initialize.'));
        script.onerror=()=>reject(new Error('Could not load the Excel export library. Check your internet connection and try again.'));
        document.head.appendChild(script);
      }).finally(()=>{sellerExportXlsxLoadingPromise=null;});
      return sellerExportXlsxLoadingPromise;
    }
    function sellerExcelDate(value){
      if(!value)return '';
      const date=new Date(value);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
    function sellerExcelStatus(product,variant){
      if(!product||product.is_active===false)return 'Inactive product';
      if(!variant||variant.is_active===false)return 'Inactive variant';
      const stock=Math.max(0,Number(variant.stock_quantity)||0);
      if(stock===0)return 'Out of stock';
      if(stock<=5)return 'Low stock';
      return 'In stock';
    }
    async function exportSellerGoogleSheetsReport(){
      if(!sellerCentreIsUnlocked){showToast('Unlock Seller Centre before exporting inventory.');return;}
      const cachedToken=sellerSheetsSessionValue(GM_SHEETS_TOKEN_KEY);
      const tokenAge=Date.now()-(Number(sellerSheetsSessionValue(GM_SHEETS_TOKEN_AT_KEY))||0);
      const scopeReady=sellerSheetsSessionValue(GM_SHEETS_SCOPE_READY_KEY)==='1';
      const tokenFresh=Boolean(cachedToken&&tokenAge>=0&&tokenAge<50*60*1000);
      // Open a tab directly in the click gesture so browser popup blockers are less likely to block the final Sheet link.
      let googleSheetsTab=null;
      if(scopeReady&&tokenFresh){try{googleSheetsTab=window.open('about:blank','_blank');}catch(openError){console.warn('Google Sheets tab could not be opened automatically.',openError);}}
      const button=$('sellerExportGoogleSheetsButton');
      if(button){button.disabled=true;button.textContent='Connecting Sheets…';}
      showCenteredActionStatus('Preparing Google Sheets report, please wait…','loading');
      sellerFeedback('sellerInventoryFeedback','Checking admin access and Google Sheets authorization…','');
      let spreadsheetUrl='';
      try{
        const client=await getSellerAdminClient();
        const sessionResult=await client.auth.getSession();
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session;
        if(!session||!session.user)throw new Error('Your GENMERCH admin session expired. Sign in again and retry.');
        if(!isAuthorizedSellerAdmin(session.user))throw new Error('Only an authorized GENMERCH admin can export this report.');

        let providerToken='';
        const liveToken=String(session.provider_token||'');
        const cachedScopeToken=sellerSheetsSessionValue(GM_SHEETS_TOKEN_KEY);
        const savedAt=Number(sellerSheetsSessionValue(GM_SHEETS_TOKEN_AT_KEY))||0;
        const savedScope=sellerSheetsSessionValue(GM_SHEETS_SCOPE_READY_KEY)==='1';
        if(savedScope&&cachedScopeToken&&Date.now()-savedAt<50*60*1000)providerToken=cachedScopeToken;
        else if(savedScope&&liveToken){providerToken=liveToken;sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_KEY,liveToken);sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_AT_KEY,String(Date.now()));}
        if(!providerToken){
          if(googleSheetsTab){try{googleSheetsTab.close();}catch(_){}googleSheetsTab=null;}
          sellerFeedback('sellerInventoryFeedback','One-time setup: connect Google Sheets access in the Google consent screen. You will return here afterwards; then click Export again.','');
          await sellerStartGoogleSheetsAuthorization(client,session.user.id);
          return;
        }

        if(button){button.textContent='Reading Supabase…';}
        const [productsResult,variantsResult,categoriesResult,ordersResult,movementsResult]=await Promise.all([
          client.from('products').select('id,name,category_id,sku,base_price,compare_at_price,location,is_active,is_demo,created_at').order('name',{ascending:true}).limit(5000),
          client.from('product_variants').select('id,product_id,sku,size_label,color_label,price_override,stock_quantity,is_active,created_at,updated_at').order('product_id',{ascending:true}).order('size_label',{ascending:true}).limit(10000),
          client.from('categories').select('id,name'),
          client.from('orders').select('id,order_number,customer_name,customer_phone,customer_email,status,payment_status,payment_method,total_amount,created_at,inventory_reserved,inventory_released').order('created_at',{ascending:false}).limit(5000),
          client.from('inventory_movements').select('id,variant_id,order_id,movement_type,quantity_delta,stock_before,stock_after,reason,actor_id,created_at,product_name_snapshot,variant_sku_snapshot,size_label_snapshot,color_label_snapshot').order('created_at',{ascending:false}).limit(10000)
        ]);
        for(const result of [productsResult,variantsResult,categoriesResult,ordersResult,movementsResult])if(result.error)throw result.error;
        const products=productsResult.data||[],variants=variantsResult.data||[],categories=categoriesResult.data||[],orders=ordersResult.data||[],movements=movementsResult.data||[];
        const productMap=new Map(products.map(row=>[String(row.id),row]));
        const categoryMap=new Map(categories.map(row=>[String(row.id),row.name||'']));
        const variantMap=new Map(variants.map(row=>[String(row.id),row]));
        const orderMap=new Map(orders.map(row=>[String(row.id),row]));
        const activeProducts=products.filter(product=>product.is_active!==false);
        const activeVariants=variants.filter(variant=>variant.is_active!==false&&productMap.has(String(variant.product_id))&&productMap.get(String(variant.product_id)).is_active!==false);
        const units=activeVariants.reduce((sum,variant)=>sum+Math.max(0,Number(variant.stock_quantity)||0),0);
        const low=activeVariants.filter(variant=>Number(variant.stock_quantity)>0&&Number(variant.stock_quantity)<=5).length;
        const out=activeVariants.filter(variant=>Number(variant.stock_quantity)<=0).length;
        const stockValue=activeVariants.reduce((sum,variant)=>{const product=productMap.get(String(variant.product_id));return sum+Math.max(0,Number(variant.stock_quantity)||0)*Math.max(0,Number(variant.price_override==null?product.base_price:variant.price_override)||0);},0);
        const paidOrders=orders.filter(order=>order.payment_status==='paid'&&!['cancelled','refunded'].includes(String(order.status||'').toLowerCase()));
        const paidSales=paidOrders.reduce((sum,order)=>sum+Math.max(0,Number(order.total_amount)||0),0);
        const exportedAt=new Date();
        const summaryRows=[
          ['GENMERCH INVENTORY & ANALYTICS REPORT'],
          ['Exported at (Philippines time)',sellerExcelDate(exportedAt.toISOString())],
          ['Report scope','Current product catalog, all variants, recent inventory movements, and recorded orders'],
          [],
          ['Metric','Value','Definition'],
          ['Active products',activeProducts.length,'Products currently active on the storefront'],
          ['Sellable variants',activeVariants.length,'Variants active under active products'],
          ['Units on hand',units,'Total stock across sellable variants'],
          ['Low stock variants',low,'Sellable variants with 1–5 units'],
          ['Out of stock variants',out,'Sellable variants with zero units'],
          ['Stock value (retail)',Number(stockValue.toFixed(2)),'Unit retail price multiplied by available stock'],
          ['Orders received',orders.length,'All orders currently recorded in Supabase'],
          ['Paid sales',Number(paidSales.toFixed(2)),'Paid orders excluding cancelled/refunded orders'],
          [],
          ['Notes'],
          ['Stock includes active product variants only in summary metrics. The Inventory sheet contains active and inactive variants.'],
          ['The Orders sheet contains order records currently saved in Supabase; the export does not create or modify orders.']
        ];
        const inventoryRows=variants.map(variant=>{
          const product=productMap.get(String(variant.product_id))||{};
          const stock=Math.max(0,Number(variant.stock_quantity)||0);
          const price=Number(variant.price_override==null?product.base_price:variant.price_override)||0;
          return {
            'Product ID':product.id||variant.product_id||'',
            'Product name':product.name||'Unknown product',
            'Category':categoryMap.get(String(product.category_id))||'',
            'Product SKU':product.sku||'',
            'Variant ID':variant.id||'',
            'Variant SKU':variant.sku||'',
            'Size':variant.size_label||'',
            'Color':variant.color_label||'',
            'Selling price (PHP)':price,
            'Stock quantity':stock,
            'Stock value (PHP)':Number((stock*price).toFixed(2)),
            'Product status':product.is_active===false?'Inactive':'Active',
            'Variant status':variant.is_active===false?'Inactive':'Active',
            'Inventory status':sellerExcelStatus(product,variant),
            'Demo product':product.is_demo===true?'Yes':'No',
            'Location':product.location||'',
            'Created at':sellerExcelDate(variant.created_at),
            'Last updated':sellerExcelDate(variant.updated_at)
          };
        });
        const movementRows=movements.map(movement=>{
          const variant=variantMap.get(String(movement.variant_id))||{};
          const product=productMap.get(String(variant.product_id))||{};
          const order=orderMap.get(String(movement.order_id))||{};
          return {
            'Movement ID':movement.id||'',
            'Date (Philippines time)':sellerExcelDate(movement.created_at),
            'Product name':product.name||movement.product_name_snapshot||'Deleted product',
            'Product SKU':product.sku||'',
            'Variant SKU':variant.sku||movement.variant_sku_snapshot||'',
            'Size':variant.size_label||movement.size_label_snapshot||'',
            'Color':variant.color_label||movement.color_label_snapshot||'',
            'Movement type':String(movement.movement_type||'').replace(/_/g,' '),
            'Quantity change':Number(movement.quantity_delta)||0,
            'Stock before':Number(movement.stock_before)||0,
            'Stock after':Number(movement.stock_after)||0,
            'Order number':order.order_number||'',
            'Reason':movement.reason||'',
            'Actor user ID':movement.actor_id||''
          };
        });
        const orderRows=orders.map(order=>({
          'Order ID':order.id||'',
          'Order number':order.order_number||'',
          'Order date (Philippines time)':sellerExcelDate(order.created_at),
          'Customer name':order.customer_name||'',
          'Customer phone':order.customer_phone||'',
          'Customer email':order.customer_email||'',
          'Status':order.status||'',
          'Payment status':order.payment_status||'',
          'Payment method':order.payment_method||'',
          'Total (PHP)':Number(order.total_amount)||0,
          'Inventory reserved':order.inventory_reserved===true?'Yes':'No',
          'Inventory released':order.inventory_released===true?'Yes':'No'
        }));
        const inventoryHeaders=['Product ID','Product name','Category','Product SKU','Variant ID','Variant SKU','Size','Color','Selling price (PHP)','Stock quantity','Stock value (PHP)','Product status','Variant status','Inventory status','Demo product','Location','Created at','Last updated'];
        const movementHeaders=['Movement ID','Date (Philippines time)','Product name','Product SKU','Variant SKU','Size','Color','Movement type','Quantity change','Stock before','Stock after','Order number','Reason','Actor user ID'];
        const orderHeaders=['Order ID','Order number','Order date (Philippines time)','Customer name','Customer phone','Customer email','Status','Payment status','Payment method','Total (PHP)','Inventory reserved','Inventory released'];
        function valuesForSheet(headers,rows,emptyLabel){
          return [headers].concat(rows.length?rows.map(row=>headers.map(header=>row[header]===undefined||row[header]===null?'':row[header])):[[emptyLabel]]);
        }
        const summaryValues=summaryRows.map(row=>row.length?row:['']);
        const inventoryValues=valuesForSheet(inventoryHeaders,inventoryRows,'No inventory records yet');
        const movementValues=valuesForSheet(movementHeaders,movementRows,'No stock movements recorded');
        const orderValues=valuesForSheet(orderHeaders,orderRows,'No orders recorded');

        const nowStamp=exportedAt.toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).replace(/[^0-9-]/g,'')||exportedAt.toISOString().slice(0,10);
        const spreadsheetTitle='GENMERCH Inventory & Analytics — '+nowStamp;
        if(button){button.textContent='Creating Google Sheet…';}
        let spreadsheet;
        try{
          spreadsheet=await sellerGoogleSheetsApiRequest('https://sheets.googleapis.com/v4/spreadsheets',providerToken,{
            method:'POST',
            body:JSON.stringify({
              properties:{title:spreadsheetTitle},
              sheets:[
                {properties:{title:'Summary',gridProperties:{frozenRowCount:5,hideGridlines:true}}},
                {properties:{title:'Inventory',gridProperties:{frozenRowCount:1,hideGridlines:true}}},
                {properties:{title:'Stock Movements',gridProperties:{frozenRowCount:1,hideGridlines:true}}},
                {properties:{title:'Orders',gridProperties:{frozenRowCount:1,hideGridlines:true}}}
              ]
            })
          });
          spreadsheetUrl=String(spreadsheet.spreadsheetUrl||'');
          if(!spreadsheet.spreadsheetId||!spreadsheetUrl)throw new Error('Google created a report response without a spreadsheet link. Please check Google Drive.');
        }catch(apiError){
          const message=String(apiError&&apiError.message||'');
          const normalized=message.toLowerCase();
          if(apiError&&(apiError.status===401||normalized.includes('insufficient authentication scopes')||normalized.includes('insufficientpermissions')||normalized.includes('access_token_scope_insufficient'))){
            sellerSheetsSetSessionValue(GM_SHEETS_SCOPE_READY_KEY,'');
            sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_KEY,'');
            sellerSheetsSetSessionValue(GM_SHEETS_TOKEN_AT_KEY,'');
            if(googleSheetsTab){try{googleSheetsTab.close();}catch(_){}googleSheetsTab=null;}
            sellerFeedback('sellerInventoryFeedback','Google needs permission to create a Sheet. Reconnecting Google access…','');
            await sellerStartGoogleSheetsAuthorization(client,session.user.id);
            return;
          }
          if(normalized.includes('has not been used in project')||normalized.includes('api has not been used')||normalized.includes('is disabled')){
            throw new Error('Google Sheets API is not enabled for the Google Cloud project connected to GENMERCH. Enable Google Sheets API in Google Cloud Console, then retry. Details: '+message);
          }
          throw apiError;
        }

        const sheetIds=new Map((spreadsheet.sheets||[]).map(sheet=>[String(sheet.properties&&sheet.properties.title||''),sheet.properties&&sheet.properties.sheetId]));
        const valueRanges=[
          {range:'Summary!A1',majorDimension:'ROWS',values:summaryValues},
          {range:'Inventory!A1',majorDimension:'ROWS',values:inventoryValues},
          {range:"'Stock Movements'!A1",majorDimension:'ROWS',values:movementValues},
          {range:'Orders!A1',majorDimension:'ROWS',values:orderValues}
        ];
        if(button){button.textContent='Writing report data…';}
        try{
          await sellerGoogleSheetsApiRequest('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet.spreadsheetId)+'/values:batchUpdate',providerToken,{
            method:'POST',
            body:JSON.stringify({valueInputOption:'RAW',data:valueRanges})
          });
        }catch(writeError){
          if(googleSheetsTab){try{googleSheetsTab.location.href=spreadsheetUrl;}catch(_){}}
          const text=String(writeError&&writeError.message||'Could not write the report rows to Google Sheets.');
          sellerGoogleSheetLinkFeedback('Google created the spreadsheet, but writing its report data failed: '+text,spreadsheetUrl);
          showCenteredActionStatus('Google Sheet created, data write needs attention','error',5000,text);
          return;
        }

        const formattingRequests=[];
        ['Inventory','Stock Movements','Orders'].forEach(title=>{
          const sheetId=sheetIds.get(title);
          const columns=title==='Inventory'?inventoryHeaders.length:(title==='Stock Movements'?movementHeaders.length:orderHeaders.length);
          const rowCount=title==='Inventory'?inventoryValues.length:(title==='Stock Movements'?movementValues.length:orderValues.length);
          if(sheetId===undefined)return;
          formattingRequests.push({
            repeatCell:{
              range:{sheetId,startRowIndex:0,endRowIndex:1},
              cell:{userEnteredFormat:{backgroundColor:{red:0.93,green:0.20,blue:0.12},textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true},wrapStrategy:'WRAP'}},
              fields:'userEnteredFormat(backgroundColor,textFormat,wrapStrategy)'
            }
          });
          formattingRequests.push({
            setBasicFilter:{filter:{range:{sheetId,startRowIndex:0,endRowIndex:Math.max(1,rowCount),startColumnIndex:0,endColumnIndex:columns}}}
          });
        });
        if(sheetIds.has('Summary')){
          formattingRequests.push({
            repeatCell:{
              range:{sheetId:sheetIds.get('Summary'),startRowIndex:4,endRowIndex:5,startColumnIndex:0,endColumnIndex:3},
              cell:{userEnteredFormat:{backgroundColor:{red:0.93,green:0.20,blue:0.12},textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true},wrapStrategy:'WRAP'}},
              fields:'userEnteredFormat(backgroundColor,textFormat,wrapStrategy)'
            }
          });
        }
        let formattingNote='';
        if(formattingRequests.length){
          try{
            await sellerGoogleSheetsApiRequest('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet.spreadsheetId)+':batchUpdate',providerToken,{
              method:'POST',body:JSON.stringify({requests:formattingRequests})
            });
          }catch(formatError){
            console.warn('The Google Sheet was written successfully, but some optional formatting could not be applied.',formatError);
            formattingNote=' The data is complete; optional table formatting could not be applied.';
          }
        }
        if(googleSheetsTab){
          try{googleSheetsTab.location.href=spreadsheetUrl;}catch(_){try{googleSheetsTab.close();}catch(__){}window.open(spreadsheetUrl,'_blank','noopener,noreferrer');}
        }else{
          try{window.open(spreadsheetUrl,'_blank','noopener,noreferrer');}catch(_){}
        }
        const successMessage='Google Sheet created successfully: '+spreadsheetTitle+'. Tabs: Summary, Inventory, Stock Movements, and Orders. Rows exported — '+inventoryRows.length+' inventory variants, '+movementRows.length+' stock movements, '+orderRows.length+' orders.'+formattingNote;
        sellerGoogleSheetLinkFeedback(successMessage,spreadsheetUrl);
        showCenteredActionStatus('Google Sheet created successfully!','success',2600,'Your report was saved directly to Google Drive.');
        showToast('Google Sheet created in your Google Drive.');
      }catch(error){
        console.error('GENMERCH Google Sheets export failed.',error);
        if(googleSheetsTab){try{googleSheetsTab.close();}catch(_){}}
        const message=String(error&&error.message||'Google Sheets export failed. Please retry.');
        if(message.toLowerCase().includes('permission')||message.toLowerCase().includes('access_denied')||message.toLowerCase().includes('not enabled')||message.toLowerCase().includes('oauth')){
          sellerFeedback('sellerInventoryFeedback',message+' If this is the first export, complete Google authorization and ensure the Google Sheets API is enabled.','error');
        }else{
          sellerFeedback('sellerInventoryFeedback',message,'error');
        }
        showCenteredActionStatus('Google Sheets export failed','error',4200,message);
        showToast('Google Sheets export failed. Please check the Seller Centre message.');
      }finally{
        if(button){button.disabled=false;button.textContent='▦ Google Sheets Export';}
      }
    }

        async function loadSellerInventoryAnalytics(){
      if(!sellerCentreIsUnlocked)return;
      sellerFeedback('sellerInventoryFeedback','','');
      sellerSetLoadingRow('sellerInventoryTableBody',7,'Loading inventory from Supabase…');
      try{
        const client=await getSellerAdminClient();
        const results=await Promise.all([
          client.from('products').select('id,name,category_id,base_price,is_active,is_deleted').eq('is_deleted',false),
          client.from('product_variants').select('id,product_id,sku,size_label,color_label,price_override,stock_quantity,is_active,updated_at').order('updated_at',{ascending:false}),
          client.from('orders').select('id,order_number,status,payment_status,total_amount,created_at').order('created_at',{ascending:false}).limit(1000),
          client.from('inventory_movements').select('id,variant_id,order_id,movement_type,quantity_delta,stock_before,stock_after,reason,actor_id,created_at,product_name_snapshot,variant_sku_snapshot,size_label_snapshot,color_label_snapshot').order('created_at',{ascending:false}).limit(50)
        ]);
        for(const result of results)if(result.error)throw result.error;
        const products=results[0].data||[],allVariants=results[1].data||[],orders=results[2].data||[],movements=results[3].data||[];
        const productMap=new Map(products.filter(item=>item.is_deleted!==true).map(item=>[String(item.id),item]));
        const visibleProducts=Array.from(productMap.values());
        try{
          const imageResult=await client.from('product_images').select('id,product_id,image_url,alt_text,is_primary,sort_order,color_label').order('sort_order',{ascending:true}).limit(10000);
          if(!imageResult.error){
            const visibleIds=new Set(visibleProducts.map(product=>String(product.id))),imageMap=new Map();
            (imageResult.data||[]).filter(image=>visibleIds.has(String(image.product_id))).forEach(image=>{
              const key=String(image.product_id);if(!imageMap.has(key))imageMap.set(key,[]);
              imageMap.get(key).push(image);
            });
            const nextImageMap=new Map();
            imageMap.forEach((images,key)=>nextImageMap.set(key,images.sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0))));
            sellerImageRowsByProductId=nextImageMap;
          }
        }catch(imageError){console.warn('Inventory product thumbnails could not be refreshed; existing images will be used.',imageError);}
        const variants=allVariants.filter(variant=>productMap.has(String(variant.product_id)));
        sellerInventoryRows=variants.map(variant=>({variant,product:productMap.get(String(variant.product_id))}));
        sellerSetInventoryFilterOptions(visibleProducts,variants);
        sellerMovementRows=movements;
        sellerRenderInventoryMetrics(visibleProducts,variants,orders);
        sellerRenderInventoryRows();sellerRenderMovements(movements,variants,visibleProducts,orders);
        sellerInventoryLoaded=true;
      }catch(error){
        sellerSetLoadingRow('sellerInventoryTableBody',7,'Inventory could not be loaded.');
        sellerSetLoadingRow('sellerMovementTableBody',6,'Inventory movement history could not be loaded.');
        sellerFeedback('sellerInventoryFeedback',error.message||'Could not load inventory analytics. Check Supabase permissions.','error');
        sellerInventoryLoaded=false;
      }
    }
    async function handleSellerStockAdjustment(button){
      if(!sellerCentreIsUnlocked)return;
      const row=button.closest('tr'),input=row?row.querySelector('[data-stock-quantity]'):null,quantity=Number(input&&input.value),direction=button.dataset.stockAdjust==='remove'?-1:1,variantId=button.dataset.variantId;
      if(!Number.isInteger(quantity)||quantity<1||quantity>1000000){sellerFeedback('sellerInventoryFeedback','Enter a whole-number quantity from 1 to 1,000,000.','error');return;}
      if(!variantId){sellerFeedback('sellerInventoryFeedback','Could not identify this product variant. Refresh inventory and try again.','error');return;}
      button.disabled=true;const priorLabel=button.textContent;button.textContent='Saving…';
      showCenteredActionStatus('Updating inventory, please wait...','loading');
      try{
        const client=await getSellerAdminClient();
        const result=await client.rpc('adjust_genmerch_stock',{p_variant_id:variantId,p_adjustment:direction*quantity,p_reason:String($('sellerStockReason').value||'').trim()||null});
        if(result.error)throw result.error;
        sellerInventoryLoaded=false;
        await loadSellerInventoryAnalytics();await loadSellerProducts();await loadSupabaseCatalog();renderCategoryFilters();renderProducts();
        sellerFeedback('sellerInventoryFeedback','Stock updated successfully. The movement has been recorded in the inventory history.','success');
        showCenteredActionStatus('Inventory updated successfully!','success',1450);
      }catch(error){sellerFeedback('sellerInventoryFeedback',error.message||'Stock adjustment failed. Stock was not changed.','error');showCenteredActionStatus(error.message||'Stock adjustment failed. Stock was not changed.','error',2200);}
      finally{if(isCenteredActionStatusLoading())hideCenteredActionStatus();button.disabled=false;button.textContent=priorLabel;}
    }

    $('sellerPasscodeForm').addEventListener('submit',verifySellerPasscode);
    $('sellerInventorySearch').addEventListener('input',()=>sellerRenderInventoryRows(true));
    ['sellerInventoryCategoryFilter','sellerInventoryVariantFilter','sellerInventoryStatusFilter'].forEach(id=>$(id).addEventListener('change',()=>sellerRenderInventoryRows(true)));
    $('sellerInventoryClearFilters').addEventListener('click',()=>{$('sellerInventorySearch').value='';$('sellerInventoryCategoryFilter').value='';$('sellerInventoryVariantFilter').value='';$('sellerInventoryStatusFilter').value='';sellerRenderInventoryRows(true);});
    document.querySelectorAll('[data-inventory-sort]').forEach(button=>button.addEventListener('click',()=>sellerInventorySortBy(button.dataset.inventorySort)));
    $('sellerOrdersSearch').addEventListener('input',sellerOrdersFilterChanged);
    ['sellerOrdersStatusFilter','sellerOrdersPaymentFilter','sellerOrdersMethodFilter','sellerOrdersDateFilter'].forEach(id=>$(id).addEventListener('change',sellerOrdersFilterChanged));
    $('sellerOrdersClearFilters').addEventListener('click',()=>{$('sellerOrdersSearch').value='';$('sellerOrdersStatusFilter').value='';$('sellerOrdersPaymentFilter').value='';$('sellerOrdersMethodFilter').value='';$('sellerOrdersDateFilter').value='';sellerRefreshOrderPaymentMethodOptions();sellerOrdersFilterChanged();});
    $('sellerProductsSearch').addEventListener('input',sellerApplyProductFilters);
    ['sellerProductsCategoryFilter','sellerProductsStatusFilter','sellerProductsStockFilter'].forEach(id=>$(id).addEventListener('change',sellerApplyProductFilters));
    $('sellerProductsApplyFilters').addEventListener('click',sellerApplyProductFilters);
    $('sellerProductsClearFilters').addEventListener('click',()=>{
      $('sellerProductsSearch').value='';
      $('sellerProductsCategoryFilter').value='';
      $('sellerProductsStatusFilter').value='';
      $('sellerProductsStockFilter').value='';
      sellerApplyProductFilters();
    });
    $('sellerProductForm').addEventListener('submit',submitSellerProduct);
    $('sellerProductResetButton').addEventListener('click',resetSellerProductForm);
    $('sellerCancelEditButton').addEventListener('click',()=>closeSellerProductEditor(true));
    SELLER_IMAGE_INPUT_IDS.forEach((id,index)=>{$(id).addEventListener('change',handleSellerImageSelection);$('sellerImageColor'+(index+1)).addEventListener('input',sellerRenderUploadPreviews);});
    $('sellerProductCategory').addEventListener('change',sellerHandleCategoryChange);$('sellerAddCustomCategoryButton').addEventListener('click',sellerAddCustomCategory);$('sellerCustomCategoryName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sellerAddCustomCategory();}});$('sellerSellingPrice').addEventListener('input',sellerUpdatePromotionPreview);$('sellerPromotionType').addEventListener('change',sellerUpdatePromotionPreview);
    $('sellerExistingGallery').addEventListener('change',event=>{if(event.target&&event.target.matches('[data-seller-remove-image]')){const state=sellerUpdateGalleryCount();if(state.total>SELLER_IMAGE_MAX_COUNT)sellerFeedback('sellerProductFeedback','Keep no more than 30 gallery photos in total. Mark existing photos for removal or choose fewer new photos.','error');else sellerFeedback('sellerProductFeedback','','');}});
    $('sellerPasscodeOverlay').addEventListener('click',event=>{if(event.target===$('sellerPasscodeOverlay')){event.preventDefault();event.stopPropagation();}});
    $('sellerDashboardOverlay').addEventListener('click',event=>{if(event.target===$('sellerDashboardOverlay')){event.preventDefault();event.stopPropagation();}});
    $('sellerProductEditorCloseButton').addEventListener('click',()=>closeSellerProductEditor(true));
    // Keep the product editor open when the user taps the dimmed backdrop.
    // Closing is explicit only: the X button, Cancel edit, or Escape key.
    $('sellerProductEditorOverlay').addEventListener('click',event=>{
      if(event.target===$('sellerProductEditorOverlay')){
        event.preventDefault();
        event.stopPropagation();
      }
    });
    $('sellerPermanentDeleteNoButton').addEventListener('click',()=>closeSellerPermanentDeleteConfirm());
    $('sellerPermanentDeleteCloseButton').addEventListener('click',()=>closeSellerPermanentDeleteConfirm());
    $('sellerPermanentDeleteYesButton').addEventListener('click',handleSellerPermanentDeleteProduct);
    $('sellerPermanentDeleteOverlay').addEventListener('click',event=>{if(event.target===$('sellerPermanentDeleteOverlay')){event.preventDefault();event.stopPropagation();}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){if($('sellerPermanentDeleteOverlay').classList.contains('open'))closeSellerPermanentDeleteConfirm();else if($('sellerProductEditorOverlay').classList.contains('open'))closeSellerProductEditor(true);else if($('sellerDashboardOverlay').classList.contains('open'))closeSellerDashboard();else if($('sellerPasscodeOverlay').classList.contains('open'))closeSellerPasscode();}});


    let customerReviewDraftItem=null;
    let customerReviewSelectedRating=5;
    let customerReviewSelectedFiles=[];
    const CUSTOMER_REVIEW_RATING_LABELS={1:'Very Poor',2:'Poor',3:'Average',4:'Good',5:'Excellent'};
    function customerReviewStars(value){return '★'.repeat(Math.max(0,Math.min(5,Number(value)||0)) )+'☆'.repeat(5-Math.max(0,Math.min(5,Number(value)||0)));}
    function customerReviewStatus(message,success=false){
      const node=$('customerReviewFormStatus');
      if(!node)return;
      node.hidden=!message;node.textContent=message||'';node.classList.toggle('success',Boolean(success));
    }
    function setCustomerReviewRating(value){
      customerReviewSelectedRating=Math.max(1,Math.min(5,Number(value)||5));
      document.querySelectorAll('[data-review-star]').forEach(button=>{
        const active=Number(button.dataset.reviewStar)<=customerReviewSelectedRating;
        button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active&&Number(button.dataset.reviewStar)===customerReviewSelectedRating));
      });
      const label=$('customerReviewRatingLabel');if(label)label.textContent=CUSTOMER_REVIEW_RATING_LABELS[customerReviewSelectedRating];
    }
    function closeCustomerRateCenter(){
      const overlay=$('customerRateOverlay');if(!overlay)return;
      overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
      if(!document.querySelector('.genmerch-review-overlay.open,.customer-orders-overlay.open,.wishlist-overlay.open,.cart-overlay.open,.cart-modal.open,.overlay.open,.customer-auth-overlay.open,.seller-modal-overlay.open,.size-overlay.open'))document.body.style.overflow='';
    }
    async function openCustomerRateCenter(){
      const overlay=$('customerRateOverlay');overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
      $('customerRateBody').innerHTML='<div class="customer-orders-loading">Loading your delivered products…</div>';
      await loadCustomerRateCenter();
    }
    let storeRatingSummaryIdleScheduled=false;
    let storeRatingSummaryRequest=null;
    function scheduleStoreRatingSummary(){
      if(storeRatingSummaryIdleScheduled)return;
      storeRatingSummaryIdleScheduled=true;
      const run=()=>{loadStoreRatingSummary().catch(error=>console.warn('GENMERCH store rating summary is still syncing.',error));};
      if(typeof window.requestIdleCallback==='function'){
        window.requestIdleCallback(run,{timeout:4500});
      }else{
        window.setTimeout(run,2200);
      }
    }
    async function loadStoreRatingSummary(){
      if(storeRatingSummaryRequest)return storeRatingSummaryRequest;
      const task=(async()=>{
      const button=$('storeRatingNavButton'),value=$('storeRatingNavValue');
      const mobileValue=$('gmMobileStoreRatingValue');
      if(!button||!value)return;
      value.textContent='…';
      if(mobileValue)mobileValue.textContent='…';
      try{
        const client=getCustomerAuthClient(),pageSize=1000;
        let offset=0,totalCount=null,totalRating=0,ratingCount=0;
        while(true){
          let request=client.from('product_reviews').select('rating',offset===0?{count:'exact'}:undefined);
          request=request.eq('moderation_status','published').order('created_at',{ascending:true}).range(offset,offset+pageSize-1);
          const result=await request;
          if(result.error)throw result.error;
          if(offset===0&&result.count!==null&&result.count!==undefined&&Number.isFinite(Number(result.count)))totalCount=Number(result.count);
          const rows=Array.isArray(result.data)?result.data:[];
          rows.forEach(row=>{
            const rating=Number(row.rating);
            if(Number.isFinite(rating)&&rating>=1&&rating<=5){totalRating+=rating;ratingCount++;}
          });
          offset+=rows.length;
          if(!rows.length||rows.length<pageSize||(totalCount!==null&&offset>=totalCount))break;
        }
        const average=ratingCount?totalRating/ratingCount:0;
        loadStoreRatingSummary.summary={loaded:true,average,count:ratingCount};
        value.textContent=ratingCount?average.toFixed(1):'New';
        if(mobileValue)mobileValue.textContent=ratingCount?average.toFixed(1):'New';
        button.setAttribute('aria-label',ratingCount?'Overall GENMERCH store rating: '+average.toFixed(1)+' out of 5 from '+ratingCount+' published reviews':'GENMERCH has no published customer reviews yet');
        button.title=ratingCount?'Overall store rating: '+average.toFixed(1)+'/5 from '+ratingCount+' published customer review'+(ratingCount===1?'':'s'):'No published customer reviews yet';
      }catch(error){
        console.warn('GENMERCH overall store rating could not load.',error);
        loadStoreRatingSummary.summary={loaded:false,average:0,count:0,error:true};
        value.textContent='—';
        if(mobileValue)mobileValue.textContent='—';
        button.setAttribute('aria-label','Overall GENMERCH store rating temporarily unavailable');
        button.title='Store rating is temporarily unavailable';
      }
      })();
      storeRatingSummaryRequest=task;
      try{return await task;}
      finally{if(storeRatingSummaryRequest===task)storeRatingSummaryRequest=null;}
    }
    function showStoreRatingDetails(){
      const summary=loadStoreRatingSummary.summary;
      if(!summary||!summary.loaded){
        showToast('Loading overall store rating…');
        loadStoreRatingSummary();
        return;
      }
      if(!summary.count){
        showToast('GENMERCH Store Rating: No published customer reviews yet.');
        return;
      }
      showToast('GENMERCH Store Rating: '+summary.average.toFixed(1)+'/5 from '+summary.count.toLocaleString('en-PH')+' published customer review'+(summary.count===1?'':'s')+'.');
    }
    // Shared, browser-native chime for order and RATE notifications.
    (function initGenmerchNotificationSound(){
      const storageKey='genmerch.notificationSoundEnabled.v1';
      let enabled=true,audioContext=null,audioUnlocked=false;
      const lastChimeAtByType=new Map();
      const playedEvents=new Map();
      try{
        const saved=localStorage.getItem(storageKey);
        if(saved!==null)enabled=saved!=='false';
      }catch(_){}
      function updateButtons(){
        document.querySelectorAll('.genmerch-notification-sound').forEach(button=>{
          button.textContent=enabled?'🔊 Sound On':'🔇 Sound Off';
          button.setAttribute('aria-pressed',String(enabled));
          button.setAttribute('aria-label',enabled?'Turn notification sound off':'Turn notification sound on');
          button.title=enabled?'Notification sound is on':'Notification sound is off';
        });
      }
      function unlockAudio(){
        if(!enabled)return;
        try{
          const AudioContextClass=window.AudioContext||window.webkitAudioContext;
          if(!AudioContextClass)return;
          if(!audioContext)audioContext=new AudioContextClass();
          if(audioContext.state==='running'){audioUnlocked=true;return;}
          const resume=audioContext.resume();
          if(resume&&typeof resume.then==='function'){
            resume.then(()=>{audioUnlocked=audioContext&&audioContext.state==='running';}).catch(()=>{});
          }else audioUnlocked=audioContext.state==='running';
        }catch(_){}
      }
      ['pointerdown','touchstart','keydown'].forEach(type=>{
        document.addEventListener(type,unlockAudio,{capture:true,passive:true});
      });
      window.isGenmerchNotificationSoundEnabled=function(){return enabled;};
      window.toggleGenmerchNotificationSound=function(){
        enabled=!enabled;
        try{localStorage.setItem(storageKey,String(enabled));}catch(_){}
        if(enabled)unlockAudio();
        updateButtons();
      };
      window.playGenmerchNotificationChime=function(eventKey,soundType){
        const key=String(eventKey||'').trim();
        const profile=['cart','checkout','welcome'].includes(soundType)?soundType:'notification';
        if(!enabled||!key||playedEvents.has(key))return;
        const now=Date.now();
        playedEvents.set(key,now);
        if(playedEvents.size>250){
          const cutoff=now-30*60*1000;
          for(const [seenKey,seenAt] of playedEvents){if(seenAt<cutoff)playedEvents.delete(seenKey);}
          while(playedEvents.size>200)playedEvents.delete(playedEvents.keys().next().value);
        }
        const cooldownMs=profile==='cart'?150:profile==='checkout'?800:profile==='welcome'?2200:1800;
        if(now-(lastChimeAtByType.get(profile)||0)<cooldownMs)return;
        if(!audioContext||!audioUnlocked||audioContext.state!=='running')return;
        lastChimeAtByType.set(profile,now);
        try{
          const start=audioContext.currentTime;
          const notes=profile==='cart'
            ?[{frequency:1174.66,offset:0,duration:0.14,volume:0.05},{frequency:1567.98,offset:0.085,duration:0.2,volume:0.06}]
            :profile==='checkout'
              ?[{frequency:783.99,offset:0,duration:0.22,volume:0.055},{frequency:987.77,offset:0.12,duration:0.22,volume:0.06},{frequency:1174.66,offset:0.24,duration:0.25,volume:0.065},{frequency:1567.98,offset:0.38,duration:0.32,volume:0.075}]
              :profile==='welcome'
                ?[{frequency:987.77,offset:0,duration:0.22,volume:0.042},{frequency:1318.51,offset:0.12,duration:0.3,volume:0.048}]
                :[{frequency:880,offset:0,duration:0.24,volume:0.075},{frequency:1174.66,offset:0.13,duration:0.24,volume:0.075},{frequency:1567.98,offset:0.27,duration:0.24,volume:0.075}];
          notes.forEach(note=>{
            const oscillator=audioContext.createOscillator();
            const gain=audioContext.createGain();
            const duration=note.duration||0.24,peak=note.volume||0.075;
            oscillator.type='sine';
            oscillator.frequency.setValueAtTime(note.frequency,start+note.offset);
            gain.gain.setValueAtTime(0.0001,start+note.offset);
            gain.gain.exponentialRampToValueAtTime(peak,start+note.offset+0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001,start+note.offset+duration);
            oscillator.connect(gain);gain.connect(audioContext.destination);
            oscillator.start(start+note.offset);
            oscillator.stop(start+note.offset+duration+0.01);
          });
        }catch(error){console.warn('GENMERCH notification chime could not play.',error);}
      };
    })();

    let customerRateBadgeLastUserId='';
    let customerRateBadgeLastCount=null;
    let customerRateBadgeRefreshSequence=0;
    async function refreshCustomerRateBadge(sessionOverride){
      const badge=$('customerRateBadge');if(!badge)return;
      const sequence=++customerRateBadgeRefreshSequence;
      try{
        const client=getCustomerAuthClient();
        let session;
        if(arguments.length>0){
          session=sessionOverride;
        }else{
          const sessionResult=await client.auth.getSession();
          if(sessionResult.error)throw sessionResult.error;
          session=sessionResult.data&&sessionResult.data.session;
        }
        const userId=session&&session.user&&session.user.id?String(session.user.id):'';
        if(!userId){
          if(sequence===customerRateBadgeRefreshSequence){
            customerRateBadgeLastUserId='';
            customerRateBadgeLastCount=null;
            badge.textContent='0';badge.hidden=true;
          }
          return;
        }
        const ordersResult=await client.from('orders')
          .select('id,created_at')
          .eq('user_id',userId)
          .eq('status','delivered')
          .order('created_at',{ascending:false})
          .limit(100);
        if(ordersResult.error)throw ordersResult.error;
        if(sequence!==customerRateBadgeRefreshSequence)return;
        const ids=(ordersResult.data||[]).map(row=>row.id).filter(Boolean);
        if(!ids.length){
          if(customerRateBadgeLastUserId!==userId){customerRateBadgeLastUserId=userId;customerRateBadgeLastCount=0;}
          else customerRateBadgeLastCount=0;
          badge.textContent='0';badge.hidden=true;
          return;
        }
        const [itemsResult,reviewsResult]=await Promise.all([
          client.from('order_items').select('id,product_id').in('order_id',ids),
          client.from('product_reviews').select('order_item_id').eq('user_id',userId)
        ]);
        if(itemsResult.error)throw itemsResult.error;
        if(reviewsResult.error)throw reviewsResult.error;
        if(sequence!==customerRateBadgeRefreshSequence)return;
        const activeSession=customerAuthCurrentSession;
        const activeUserId=activeSession&&activeSession.user&&activeSession.user.id?String(activeSession.user.id):'';
        if(activeUserId&&activeUserId!==userId)return;
        const reviewed=new Set((reviewsResult.data||[]).map(row=>String(row.order_item_id)));
        const count=(itemsResult.data||[]).filter(row=>row.product_id&&!reviewed.has(String(row.id))).length;
        if(customerRateBadgeLastUserId!==userId){
          customerRateBadgeLastUserId=userId;
          customerRateBadgeLastCount=count;
        }else{
          const previousCount=customerRateBadgeLastCount;
          customerRateBadgeLastCount=count;
          if(previousCount!==null&&count>previousCount&&typeof window.playGenmerchNotificationChime==='function'){
            window.playGenmerchNotificationChime('rate:'+userId+':'+count);
          }
        }
        badge.textContent=count>99?'99+':String(count);
        badge.hidden=count===0;
      }catch(error){
        if(sequence===customerRateBadgeRefreshSequence)console.warn('GENMERCH review badge could not refresh.',error);
      }
    }
    async function loadCustomerRateCenter(){
      const body=$('customerRateBody');
      try{
        const client=getCustomerAuthClient(),sessionResult=await client.auth.getSession();
        if(sessionResult.error)throw sessionResult.error;
        const session=sessionResult.data&&sessionResult.data.session;
        if(!session||!session.user){
          body.innerHTML='<div class="customer-orders-empty"><strong>Sign in to rate your purchases</strong>Only delivered products linked to your account can be reviewed.<br><button type="button" onclick="closeCustomerRateCenter();document.getElementById(&quot;customerAuthOverlay&quot;).classList.add(&quot;open&quot;);document.getElementById(&quot;customerAuthOverlay&quot;).setAttribute(&quot;aria-hidden&quot;,&quot;false&quot;)">Sign In / Create Account</button></div>';return;
        }
        const userId=String(session.user.id);
        const ordersResult=await client.from('orders').select('id,order_number,status,created_at').eq('user_id',userId).eq('status','delivered').order('created_at',{ascending:false}).limit(100);
        if(ordersResult.error)throw ordersResult.error;
        const orders=ordersResult.data||[];
        if(!orders.length){body.innerHTML='<div class="customer-orders-empty"><strong>No delivered purchases to rate yet</strong>When an order is marked Delivered, its products will appear here.</div>';const badge=$('customerRateBadge');if(badge)badge.hidden=true;return;}
        const orderIds=orders.map(row=>row.id);
        const [itemsResult,reviewsResult]=await Promise.all([
          client.from('order_items').select('id,order_id,product_id,product_name,sku,size_label,color_label,quantity,image_url_snapshot,created_at').in('order_id',orderIds).order('created_at',{ascending:false}),
          client.from('product_reviews').select('order_item_id').eq('user_id',userId)
        ]);
        if(itemsResult.error)throw itemsResult.error;if(reviewsResult.error)throw reviewsResult.error;
        const orderMap=new Map(orders.map(row=>[String(row.id),row]));
        const reviewed=new Set((reviewsResult.data||[]).map(row=>String(row.order_item_id)));
        const items=(itemsResult.data||[]).filter(row=>row.product_id&&!reviewed.has(String(row.id)));
        const badge=$('customerRateBadge');if(badge){badge.textContent=items.length>99?'99+':String(items.length);badge.hidden=items.length===0;}
        if(!items.length){body.innerHTML='<div class="customer-orders-empty"><strong>You are all caught up!</strong>Every delivered product from your account has already been reviewed.</div>';return;}
        body.innerHTML='<p style="margin:0 0 12px;color:#756b64;font-size:.78rem;line-height:1.5">Each delivered product can receive its own review. Your rating starts at 5 stars, and you can change it before submitting.</p>'+items.map(item=>{
          const order=orderMap.get(String(item.order_id))||{},image=safeCatalogImageUrl(item.image_url_snapshot||'');
          return '<article class="genmerch-review-item">'+(image?'<img src="'+escapeHtml(image)+'" alt="'+escapeHtml(item.product_name)+'">':'<img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2268%22 height=%2272%22 viewBox=%220 0 68 72%22%3E%3Crect width=%2268%22 height=%2272%22 rx=%228%22 fill=%22%23fff0e8%22/%3E%3Ctext x=%2234%22 y=%2245%22 font-size=%2230%22 text-anchor=%22middle%22%3E%F0%9F%91%95%3C/text%3E%3C/svg%3E" alt="">')+'<div><strong>'+escapeHtml(item.product_name||'GENMERCH Product')+'</strong><small>Order '+escapeHtml(order.order_number||'')+' · '+escapeHtml(item.color_label||'Color not specified')+' · '+escapeHtml(item.size_label||'Size not specified')+' · Qty '+escapeHtml(item.quantity)+'</small></div><button type="button" class="genmerch-review-action" data-review-item="'+escapeHtml(item.id)+'">Rate Now</button></article>';
        }).join('');
        body.querySelectorAll('[data-review-item]').forEach(button=>button.addEventListener('click',()=>{
          const item=items.find(row=>String(row.id)===String(button.dataset.reviewItem));if(item)renderCustomerReviewForm(item);
        }));
      }catch(error){
        console.error('GENMERCH could not load eligible products for review.',error);
        body.innerHTML='<div class="customer-orders-empty"><strong>We could not load your delivered products</strong>'+escapeHtml(error&&error.message?error.message:'Please refresh and try again.')+'<br><button type="button" onclick="loadCustomerRateCenter()">Try Again</button></div>';
      }
    }
    function renderCustomerReviewForm(item){
      customerReviewDraftItem=item;customerReviewSelectedRating=5;customerReviewSelectedFiles=[];
      const body=$('customerRateBody');
      const image=safeCatalogImageUrl(item.image_url_snapshot||'');
      body.innerHTML='<button type="button" class="genmerch-review-photo-button" id="customerReviewBackButton">← Back to delivered products</button><form class="genmerch-review-form" id="customerReviewForm" style="margin-top:12px"><h3>Rate Your Product</h3><p>'+escapeHtml(item.product_name||'GENMERCH Product')+' · '+escapeHtml(item.color_label||'Color not specified')+' · '+escapeHtml(item.size_label||'Size not specified')+'</p>'+(image?'<img src="'+escapeHtml(image)+'" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:9px">':'')+'<div class="genmerch-review-field"><label>Your rating</label><div class="genmerch-review-stars" role="group" aria-label="Choose a star rating">'+[1,2,3,4,5].map(n=>'<button type="button" class="genmerch-review-star '+(n<=5?'active':'')+'" data-review-star="'+n+'" aria-label="'+n+' star'+(n===1?'':'s')+'" aria-pressed="'+(n===5?'true':'false')+'">★</button>').join('')+'</div><div class="genmerch-review-rating-label" id="customerReviewRatingLabel">Excellent</div></div><div class="genmerch-review-field"><label for="customerReviewFeedback">Your feedback</label><textarea id="customerReviewFeedback" maxlength="2000" minlength="3" placeholder="Share your experience with this product…" required></textarea></div><div class="genmerch-review-field"><label for="customerReviewNickname">Enter your nickname</label><input id="customerReviewNickname" maxlength="40" minlength="2" placeholder="Nickname shown with your review" required></div><div class="genmerch-review-field"><label>Photos (optional, up to 3; max 2 MB each)</label><div class="genmerch-review-photo-actions"><label class="genmerch-review-photo-button" for="customerReviewCameraInput">📷 Take a Picture</label><input id="customerReviewCameraInput" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><label class="genmerch-review-photo-button" for="customerReviewUploadInput">＋ Upload Picture(s)</label><input id="customerReviewUploadInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div><div class="genmerch-review-photo-preview" id="customerReviewPhotoPreview"></div></div><button class="genmerch-review-submit" id="customerReviewSubmit" type="submit">Submit Review</button><div class="genmerch-review-status" id="customerReviewFormStatus" role="status" aria-live="polite" hidden></div></form>';
      $('customerReviewBackButton').addEventListener('click',loadCustomerRateCenter);
      body.querySelectorAll('[data-review-star]').forEach(button=>button.addEventListener('click',()=>setCustomerReviewRating(button.dataset.reviewStar)));
      const addFiles=input=>{
        const incoming=Array.from(input.files||[]);
        for(const file of incoming){
          if(!['image/jpeg','image/png','image/webp'].includes(file.type)){customerReviewStatus('Please choose a JPG, PNG, or WebP image.');continue;}
          if(file.size>2097152){customerReviewStatus('Each photo must be 2 MB or smaller.');continue;}
          if(customerReviewSelectedFiles.length>=3){customerReviewStatus('You can attach up to 3 photos.');break;}
          customerReviewSelectedFiles.push(file);
        }
        input.value='';
        const preview=$('customerReviewPhotoPreview');
        preview.innerHTML=customerReviewSelectedFiles.map((file,index)=>'<img src="'+URL.createObjectURL(file)+'" alt="Review photo '+(index+1)+'">').join('');
        if(customerReviewSelectedFiles.length)customerReviewStatus(customerReviewSelectedFiles.length+' photo(s) selected.',true);
      };
      $('customerReviewCameraInput').addEventListener('change',event=>addFiles(event.target));
      $('customerReviewUploadInput').addEventListener('change',event=>addFiles(event.target));
      $('customerReviewForm').addEventListener('submit',submitCustomerProductReview);
    }
    async function submitCustomerProductReview(event){
      event.preventDefault();
      const form=$('customerReviewForm'),button=$('customerReviewSubmit');if(!form||!customerReviewDraftItem)return;
      const feedback=$('customerReviewFeedback').value.trim(),nickname=$('customerReviewNickname').value.trim();
      if(feedback.length<3){customerReviewStatus('Please enter feedback of at least 3 characters.');return;}
      if(nickname.length<2){customerReviewStatus('Please enter a nickname of at least 2 characters.');return;}
      button.disabled=true;button.textContent='Submitting…';customerReviewStatus('');
      try{
        const client=getCustomerAuthClient(),sessionResult=await client.auth.getSession(),session=sessionResult.data&&sessionResult.data.session;
        if(!session||!session.user)throw new Error('Please sign in again before submitting your review.');
        const photoUrls=[];
        for(let i=0;i<customerReviewSelectedFiles.length;i++){
          const file=customerReviewSelectedFiles[i],ext=file.type==='image/png'?'png':(file.type==='image/webp'?'webp':'jpg');
          const path=String(session.user.id)+'/'+String(customerReviewDraftItem.id)+'-'+Date.now()+'-'+(i+1)+'.'+ext;
          const upload=await client.storage.from('genmerch-review-photos').upload(path,file,{contentType:file.type,upsert:false});
          if(upload.error)throw upload.error;
          const url=client.storage.from('genmerch-review-photos').getPublicUrl(upload.data.path).data.publicUrl;
          photoUrls.push(url);
        }
        const result=await client.rpc('submit_product_review',{
          p_order_item_id:customerReviewDraftItem.id,p_rating:customerReviewSelectedRating,
          p_feedback:feedback,p_nickname:nickname,p_photo_urls:photoUrls
        });
        if(result.error)throw result.error;
        $('customerRateBody').innerHTML='<div class="customer-orders-empty"><strong>Thank you for your support to GENMERCH ~ Suot Apparel!</strong>We value your kind feedback.</div>';
        await refreshCustomerRateBadge();
        window.setTimeout(()=>{if($('customerRateOverlay').classList.contains('open'))loadCustomerRateCenter();},1600);
      }catch(error){
        console.error('GENMERCH product review submission failed.',error);
        customerReviewStatus(error&&error.message?error.message:'We could not submit your review. Please try again.');
      }finally{
        const submit=$('customerReviewSubmit');if(submit){submit.disabled=false;submit.textContent='Submit Review';}
      }
    }
    function formatProductSoldCount(value){
      const count=Math.max(0,Number(value)||0);
      if(count>=1000000)return (count/1000000).toFixed(count>=10000000?0:1).replace(/\.0$/,'')+'M';
      if(count>=1000)return (count/1000).toFixed(count>=10000?0:1).replace(/\.0$/,'')+'K';
      return count.toLocaleString('en-PH');
    }
    function renderProductCardSalesReviews(node,stats){
      if(!node)return;
      node.classList.remove('genmerch-inline-loading');
      if(stats&&stats.unavailable){
        node.innerHTML='<span class="card-sales-unavailable">Sales &amp; reviews unavailable</span>';
        return;
      }
      const sold=Math.max(0,Number(stats&&stats.sold_count)||0);
      const reviewCount=Math.max(0,Number(stats&&stats.review_count)||0);
      const average=reviewCount?Number(stats&&stats.average_rating)||0:0;
      node.innerHTML='<span class="card-sales-sold"><strong>'+escapeHtml(formatProductSoldCount(sold))+'</strong> Sold</span>'+
        (reviewCount
          ?'<span class="card-sales-rating">⭐ '+average.toFixed(1)+'</span><span class="card-sales-review-count">'+reviewCount.toLocaleString('en-PH')+' review'+(reviewCount===1?'':'s')+'</span>'
          :'<span class="card-sales-no-rating">☆ No reviews yet</span>');
    }
    function loadProductCardSalesReviews(productList){
      const cache=loadProductCardSalesReviews.cache||(loadProductCardSalesReviews.cache=new Map());
      const pending=loadProductCardSalesReviews.pending||(loadProductCardSalesReviews.pending=new Map());
      const findNode=id=>Array.from(document.querySelectorAll('[data-card-sales-review]')).find(node=>node.dataset.cardSalesReview===String(id));
      productList.forEach(product=>{
        const id=String(product&&product.id||'');
        if(!id)return;
        const node=findNode(id);
        if(cache.has(id)){renderProductCardSalesReviews(node,cache.get(id));return;}
        if(pending.has(id)){
          pending.get(id).then(stats=>renderProductCardSalesReviews(findNode(id),stats));
          return;
        }
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
          const unavailable={unavailable:true};
          cache.set(id,unavailable);
          renderProductCardSalesReviews(node,unavailable);
          return;
        }
        const request=getCustomerAuthClient().rpc('get_public_product_sales_review_stats',{p_product_id:id})
          .then(result=>{
            if(result.error)throw result.error;
            const raw=Array.isArray(result.data)?(result.data[0]||{}):(result.data||{});
            const stats={
              sold_count:Math.max(0,Number(raw.sold_count)||0),
              review_count:Math.max(0,Number(raw.review_count)||0),
              average_rating:Math.max(0,Number(raw.average_rating)||0)
            };
            cache.set(id,stats);
            return stats;
          })
          .catch(error=>{
            console.warn('GENMERCH product-card sales and reviews could not load for product '+id+'.',error);
            const unavailable={unavailable:true};
            cache.set(id,unavailable);
            return unavailable;
          })
          .finally(()=>pending.delete(id));
        pending.set(id,request);
        request.then(stats=>renderProductCardSalesReviews(findNode(id),stats));
      });
    }

    const productSocialStatsCache=new Map();
    const productSocialStatsPending=new Map();
    function getProductSocialStats(productId){
      const key=String(productId||'');
      const cached=productSocialStatsCache.get(key);
      if(cached&&cached.expiresAt>Date.now())return Promise.resolve(cached.data);
      if(productSocialStatsPending.has(key))return productSocialStatsPending.get(key);
      const request=getCustomerAuthClient().rpc('get_public_product_sales_review_stats',{p_product_id:productId})
        .then(result=>{
          if(result.error)throw result.error;
          const raw=Array.isArray(result.data)?(result.data[0]||{}):(result.data||{});
          const data={
            sold_count:Math.max(0,Number(raw.sold_count)||0),
            review_count:Math.max(0,Number(raw.review_count)||0),
            average_rating:Math.max(0,Number(raw.average_rating)||0)
          };
          productSocialStatsCache.set(key,{data,expiresAt:Date.now()+30000});
          return data;
        })
        .finally(()=>productSocialStatsPending.delete(key));
      productSocialStatsPending.set(key,request);
      return request;
    }

    async function loadProductSalesStats(productId){
      const node=$('productModalSocialProof');if(!node)return;
      try{
        const stats=await getProductSocialStats(productId);
        const sold=stats.sold_count;
        const reviewCount=stats.review_count;
        const average=reviewCount?stats.average_rating:0;
        node.innerHTML='<span class="sold"><strong>'+escapeHtml(formatProductSoldCount(sold))+'</strong> Sold</span>'+
          (reviewCount?'<span class="rating">⭐ '+average.toFixed(1)+'</span><span>'+reviewCount.toLocaleString('en-PH')+' review'+(reviewCount===1?'':'s')+'</span>':'<span class="rating">No ratings yet</span>');
      }catch(error){
        console.warn('GENMERCH sold count and rating summary could not load.',error);
        node.innerHTML='<span class="sold">Sales data unavailable</span><span class="rating">Reviews below</span>';
      }
    }

    async function loadProductReviews(productId){
      const section=$('productModalRatings');if(!section)return;
      section.innerHTML='<h3>Product Ratings &amp; Reviews</h3><div class="genmerch-review-empty">Loading customer reviews…</div>';
      try{
        const client=getCustomerAuthClient();
        const [result,stats]=await Promise.all([
          client.from('product_reviews').select('rating,feedback,nickname,photo_urls,created_at').eq('product_id',productId).eq('moderation_status','published').order('created_at',{ascending:false}).limit(30),
          getProductSocialStats(productId).catch(error=>{
            console.warn('GENMERCH aggregate review summary unavailable; using the loaded review sample.',error);
            return null;
          })
        ]);
        if(result.error)throw result.error;
        const reviews=result.data||[];
        let reviewCount=reviews.length;
        let average=reviews.length?reviews.reduce((sum,review)=>sum+Number(review.rating||0),0)/reviews.length:0;
        if(stats){
          reviewCount=stats.review_count;
          average=reviewCount?stats.average_rating:0;
        }
        if(!reviews.length){section.innerHTML='<h3>Product Ratings &amp; Reviews</h3><div class="genmerch-review-empty">No reviews yet. If you have purchased and received this product, you can be the first to share your experience.</div>';return;}
        section.innerHTML='<h3>Product Ratings &amp; Reviews</h3><div class="genmerch-rating-summary"><div class="genmerch-rating-average">'+average.toFixed(1)+'</div><div><div class="genmerch-rating-stars">'+customerReviewStars(Math.round(average))+'</div><small>'+reviewCount.toLocaleString('en-PH')+' verified review(s) · showing latest '+reviews.length+'</small></div></div>'+reviews.map(review=>'<article class="genmerch-review-card"><div class="genmerch-review-card-head"><strong>'+escapeHtml(review.nickname||'GENMERCH Customer')+' <span style="color:#218044;font-size:.68rem">✓ Verified Purchase</span></strong><span class="genmerch-review-card-date">'+escapeHtml(customerOrderDate(review.created_at))+'</span></div><div class="genmerch-rating-stars">'+customerReviewStars(review.rating)+'</div><p>'+escapeHtml(review.feedback)+'</p>'+(Array.isArray(review.photo_urls)&&review.photo_urls.length?'<div class="genmerch-review-photos">'+review.photo_urls.map(url=>'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener"><img src="'+escapeHtml(url)+'" alt="Customer review photo" loading="lazy" decoding="async"></a>').join('')+'</div>':'')+'</article>').join('');
      }catch(error){console.warn('GENMERCH product reviews could not load.',error);section.innerHTML='<h3>Product Ratings &amp; Reviews</h3><div class="genmerch-review-empty">Reviews are temporarily unavailable. Please try again later.</div>';}
    }

    async function initializeStorefront(){
      const hasWarmCatalog=restoreCatalogFromCache();
      if(hasWarmCatalog){
        // Paint the last live catalogue snapshot immediately; refresh it from Supabase in the background.
        restoreDraftState();
        renderCategoryFilters();
        renderProducts();
        updateCart();
      }else{
        try{await loadSupabaseCatalog();}
        catch(error){
          catalogLoadState='fallback';
          console.error('GENMERCH catalogue could not load from Supabase; using the local fallback catalogue.',error);
        }
        restoreDraftState();
        renderCategoryFilters();
        renderProducts();
        updateCart();
      }
      // Ratings are secondary content. Defer the full aggregate scan until the browser is idle.
      scheduleStoreRatingSummary();
      window.setTimeout(async function(){
        const backgroundTasks=[];
        if(hasWarmCatalog){
          backgroundTasks.push(loadSupabaseCatalog().then(()=>{
            renderCategoryFilters();
            renderProducts();
            updateCart();
          }).catch(error=>console.warn('GENMERCH live catalogue refresh failed; the cached catalogue remains visible.',error)));
        }
        let session=customerAuthCurrentSession;
        try{
          const authResult=await getCustomerAuthClient().auth.getSession();
          if(authResult.error)throw authResult.error;
          session=authResult.data&&authResult.data.session&&authResult.data.session.user?authResult.data.session:null;
          customerAuthCurrentSession=session;
        }catch(error){
          console.warn('GENMERCH could not resolve the customer session during background startup.',error);
        }
        if(session){
          syncCustomerOrdersBadgeRealtime(session);
          refreshCustomerRateBadge(session);
          // Notifications initialize and bind their own auth + Realtime listener.
          // Do not issue a second full notification fetch from storefront startup.
        }
        backgroundTasks.push(syncCustomerDraftForCustomerStartup(session));
        backgroundTasks.push(syncWishlistForCustomerSession(session,false));
        backgroundTasks.push(restoreSellerCentreAfterRefresh());
        await Promise.allSettled(backgroundTasks);
        // Apply any newer cloud draft only after safely re-reading the latest local snapshot.
        restoreDraftState();
        updateCart();
        await restoreAddressReferenceContext();
        renderProducts();
      },0);

      const reloadMarker=new URLSearchParams(window.location.search).get('_gm_reload');
      if(reloadMarker){
        const cleanUrl=new URL(window.location.href);
        cleanUrl.searchParams.delete('_gm_reload');
        window.history.replaceState(window.history.state,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
        let notice=null;
        try{
          notice=JSON.parse(sessionStorage.getItem('genmerch.lastHardReloadNotice')||'null');
          sessionStorage.removeItem('genmerch.lastHardReloadNotice');
        }catch(_){}
        pendingGenmerchReloadNotice=notice&&notice.warning
          ?'GENMERCH reloaded successfully. '+notice.warning
          :'GENMERCH storefront reloaded. Latest catalogue and account data are syncing in the background.';
      }
    }
    async function syncCustomerDraftForCustomerStartup(session){
      if(!session||!session.user){
        customerDraftCloudReadyUserId='';
        return false;
      }
      return syncCustomerDraftForSession(session,false);
    }
    window.GENMERCH_INITIALIZATION_PROMISE=initializeStorefront();
    if(typeof window.GENMERCH_APP_SCRIPT_READY_RESOLVE==='function'){
      window.GENMERCH_APP_SCRIPT_READY_RESOLVE(window.GENMERCH_INITIALIZATION_PROMISE);
      window.GENMERCH_APP_SCRIPT_READY_RESOLVE=null;
    }

    // Flush a final draft snapshot when the browser is backgrounded or about to navigate away.
    window.addEventListener('pagehide', saveDraftState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveDraftState();
      else{
        syncWishlistForCustomerSession(undefined,true);
        syncCustomerDraftForSession(undefined,true);
        syncCustomerOrdersBadgeRealtime(customerAuthCurrentSession);
        refreshCustomerRateBadge(customerAuthCurrentSession);
      }
    });
    window.addEventListener('focus',()=>{
      if(!document.hidden&&customerAuthCurrentSession&&customerAuthCurrentSession.user){
        refreshCustomerOrdersBadge(customerAuthCurrentSession).catch(error=>console.warn('GENMERCH Orders badge focus refresh failed.',error));
        refreshCustomerRateBadge(customerAuthCurrentSession).catch(error=>console.warn('GENMERCH RATE badge focus refresh failed.',error));
      }
    });
    window.addEventListener('online',()=>{
      if(customerAuthCurrentSession&&customerAuthCurrentSession.user){
        syncCustomerOrdersBadgeRealtime(customerAuthCurrentSession);
        refreshCustomerRateBadge(customerAuthCurrentSession);
      }
    });
    /*
     * Do not show a global blocking loader for every button click.
     * UI-only interactions (auth tabs, show/hide password, category/dashboard tabs,
     * filters, modal controls and other local form edits) should react immediately.
     * Real asynchronous operations retain their own explicit loading/feedback inside
     * the relevant handlers (login, checkout, stock verification, save/upload, etc.).
     */

  