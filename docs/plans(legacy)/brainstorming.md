Atomic Finding Format                                                                                 
                                                                                                                          
  核心原则：每个 Finding = 一个独立的知识原子                                                                             
                                                                                                                          
  model Finding {                                                                                                         
    id          String   @id @default(cuid())                                                                             
    contextId   String                                                                                                    
                                                                                                                          
    // 原子内容                                                                                                           
    claim       String   // 核心主张，一句话 (如: "小chunk尺寸提升检索精度")                                              
    evidence    String?  // 支撑证据摘要                                                                                  
                                                                                                                          
    // 元数据                                                                                                             
    confidence  String   @default("medium") // high, medium, low                                                          
    sourceType  String   // internal, external, synthesized (合并生成)                                                    
    tags        String[] // 主题标签，用于聚类和图谱                                                                      
                                                                                                                          
    // 关系 (用于图谱)                                                                                                    
    relations   FindingRelation[]                                                                                         
                                                                                                                          
    // 溯源 (用于合并追踪)                                                                                                
    parentIds   String[] // 如果是合并产生，记录来源finding IDs                                                           
                                                                                                                          
    // 引用                                                                                                               
    citations   Citation[]                                                                                                
                                                                                                                          
    // 状态                                                                                                               
    status      String   @default("active") // active, merged, archived                                                   
                                                                                                                          
    createdAt   DateTime                                                                                                  
    updatedAt   DateTime                                                                                                  
  }                                                                                                                       
                                                                                                                          
  model FindingRelation {                                                                                                 
    id            String  @id @default(cuid())                                                                            
    fromFindingId String                                                                                                  
    toFindingId   String                                                                                                  
    relationType  String  // supports, contradicts, extends, related                                                      
  }                                                                                                                       
                                                                                                                          
  Finding 生命周期：                                                                                                      
                                                                                                                          
  [用户添加] → [原子Finding] → [工作流分析] → [建议合并/关联] → [用户确认]                                                
                    ↓                                                                                                     
              [生成报告]                                                                                                  
                    ↓                                                                                                     
              [展示图谱]                                                                                                  
                                                                                                                          
  合并逻辑示例：                                                                                                          
  - Finding A: "chunk size 256效果好"                                                                                     
  - Finding B: "chunk size 512效果好"                                                                                     
  - 工作流检测相似 → 建议合并 →                                                                                           
  - 新 Finding: "chunk size 256-512是最佳范围" (parentIds: [A, B], sourceType: "synthesized")                             
                                                                                                                          
  ---                                                                                                                     
  这个原子格式能支持你说的所有场景：编辑、删除、合并、报告、图谱。                                                        
                                                                                                                          
  你觉得这个格式合适吗？接下来要讨论图谱展示还是报告生成？