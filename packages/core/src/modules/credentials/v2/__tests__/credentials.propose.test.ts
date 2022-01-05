import type { Agent } from '../../../../../src/agent/Agent'
import type { ConnectionRecord } from '../../../../../src/modules/connections'

import { Attachment, AttachmentData } from '../../../../../src/decorators/attachment/Attachment'
import { CredentialRecord } from '../../../../../src/modules/credentials/repository'
import { CredentialPreview } from '../../../../../src/modules/credentials/v1/messages'
import { CredentialState } from '../../../../../src/modules/credentials'
import type {
  Schema,
} from 'indy-sdk'
import { CredentialProtocolVersion } from '../../../../../src/modules/credentials/CredentialProtocolVersion'
import { AcceptProposalOptions, ProposeCredentialOptions } from '../../../../../src/modules/credentials/v2/interfaces'
import { CredentialRole } from '../../../../../src/modules/credentials/v2/CredentialRole';
import { LinkedAttachment } from '../../../../../src/utils/LinkedAttachment'
import { unitTestLogger } from '../../../../../src/logger'
import { CredentialExchangeRecord } from '../../../../../src/modules/credentials/v2/CredentialExchangeRecord'
import { JsonTransformer } from '../../../../../src/utils/JsonTransformer'
import testLogger from '../../../../../tests/logger'
import { setupCredentialTests, waitForCredentialRecord } from '../../../../../tests/helpers'

let credentialPreview = CredentialPreview.fromRecord({
  name: 'John',
  age: '99',
})


describe('credentials', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let credDefId: string
  let faberConnection: ConnectionRecord
  let aliceConnection: ConnectionRecord
  let faberCredentialRecord: CredentialRecord
  let aliceCredentialRecord: CredentialRecord
  let schema: Schema


  beforeAll(async () => {
    ; ({ faberAgent, aliceAgent, credDefId, schema, faberConnection, aliceConnection } = await setupCredentialTests(
      'Faber Agent Credentials',
      'Alice Agent Credential'
    ))
  })

  afterAll(async () => {
    await faberAgent.shutdown()
    await faberAgent.wallet.delete()
    await aliceAgent.shutdown()
    await aliceAgent.wallet.delete()
  })


  // ==============================
  // TEST v1 BEGIN
  // ==========================
  test('Alice starts with V1 credential proposal to Faber', async () => {
    testLogger.test('Alice sends (v1) credential proposal to Faber')
    // set the propose options
    const proposeOptions: ProposeCredentialOptions = {
      connectionId: aliceConnection.id,
      protocolVersion: CredentialProtocolVersion.V1_0,
      credentialFormats: {
        indy: {
          attributes: credentialPreview.attributes,
          schemaIssuerDid: faberAgent.publicDid?.did,
          schemaName: schema.name,
          schemaVersion: schema.version,
          schemaId: schema.id,
          issuerDid: faberAgent.publicDid?.did,
          credentialDefinitionId: credDefId,
          linkedAttachments: [
            new LinkedAttachment({
              name: 'profile_picture',
              attachment: new Attachment({
                mimeType: 'image/png',
                data: new AttachmentData({ base64: 'base64encodedpic' }),
              }),
            }),
          ],

        }
      },
      comment: "v1 propose credential test"
    }
    unitTestLogger("ProposeCredentialOptions indy proposeOptions attributes = ", proposeOptions.credentialFormats.indy?.attributes)

    let credentialExchangeRecord = await aliceAgent.credentials.proposeCredential(proposeOptions)

    expect(credentialExchangeRecord.connectionId).toEqual(proposeOptions.connectionId)
    expect(credentialExchangeRecord.protocolVersion).toEqual(CredentialProtocolVersion.V1_0)
    expect(credentialExchangeRecord.state).toEqual(CredentialState.ProposalSent)
    expect(credentialExchangeRecord.role).toEqual(CredentialRole.Holder)
    expect(credentialExchangeRecord.threadId).not.toBeNull()
    testLogger.test('Faber waits for credential proposal from Alice')
    let faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: credentialExchangeRecord.threadId,
      state: CredentialState.ProposalReceived,
    })
    const connId = credentialExchangeRecord.connectionId ? credentialExchangeRecord.connectionId : ""

    let options: AcceptProposalOptions = {
      connectionId: faberConnection.id,
      protocolVersion: credentialExchangeRecord.protocolVersion,
      credentialRecordId: faberCredentialRecord.id,
      comment: 'V1 Indy Proposal',
      credentialFormats: {
        indy: {
          attributes: credentialPreview.attributes,
          credentialDefinitionId: credDefId,
        }
      }
    }

    testLogger.test('Faber sends credential offer to Alice')
    let acceptCredentialExchangeRecord: CredentialExchangeRecord = await faberAgent.credentials.acceptCredentialProposal(
      options)

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.OfferReceived,
    })

    expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
      createdAt: expect.any(Date),
      offerMessage: {
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/issue-credential/1.0/offer-credential',
        comment: 'V1 Indy Proposal',
        credential_preview: {
          '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
          attributes: [
            {
              name: 'name',
              'mime-type': 'text/plain',
              value: 'John',
            },
            {
              name: 'age',
              'mime-type': 'text/plain',
              value: '99',
            },
            {
              name: "profile_picture",
              'mime-type': "image/png",
              value: "hl:zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg",
            },
          ],
        },
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })
    // below values are not in json object
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.getTags()).toEqual({
      threadId: faberCredentialRecord.threadId,
      connectionId: aliceCredentialRecord.connectionId,
      state: aliceCredentialRecord.state,
    })
    expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)
  })

  // ==============================
  // TEST v1 END
  // ==========================    


  // testLogger.test('Alice sends credential request to Faber')
  // aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

  // testLogger.test('Faber waits for credential request from Alice')
  // faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //   threadId: aliceCredentialRecord.threadId,
  //   state: CredentialState.RequestReceived,
  // })

  // testLogger.test('Faber sends credential to Alice')
  // faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

  // testLogger.test('Alice waits for credential from Faber')
  // aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
  //   threadId: faberCredentialRecord.threadId,
  //   state: CredentialState.CredentialReceived,
  // })

  // testLogger.test('Alice sends credential ack to Faber')
  // aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

  // testLogger.test('Faber waits for credential ack from Alice')
  // faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //   threadId: faberCredentialRecord.threadId,
  //   state: CredentialState.Done,
  // })

  // expect(aliceCredentialRecord).toMatchObject({
  //   type: CredentialRecord.name,
  //   id: expect.any(String),
  //   createdAt: expect.any(Date),
  //   threadId: expect.any(String),
  //   connectionId: expect.any(String),
  //   offerMessage: expect.any(Object),
  //   requestMessage: expect.any(Object),
  //   credentialId: expect.any(String),
  //   state: CredentialState.Done,
  // })

  // expect(faberCredentialRecord).toMatchObject({
  //   type: CredentialRecord.name,
  //   id: expect.any(String),
  //   createdAt: expect.any(Date),
  //   threadId: expect.any(String),
  //   connectionId: expect.any(String),
  //   offerMessage: expect.any(Object),
  //   requestMessage: expect.any(Object),
  //   state: CredentialState.Done,
  // })

  // })


  // -------------------------- V2 TEST BEGIN --------------------------------------------

  test('Alice starts with V2 (Indy format) credential proposal to Faber', async () => {

    let credentialPreview = CredentialPreview.fromRecord({
      name: 'John',
      age: '99',
    }, CredentialProtocolVersion.V2_0)
    testLogger.test('Alice sends (v2) credential proposal to Faber')
    // set the propose options
    // we should set the version to V1.0 and V2.0 in separate tests, one as a regression test
    const proposeOptions: ProposeCredentialOptions = {
      connectionId: aliceConnection.id,
      protocolVersion: CredentialProtocolVersion.V2_0,
      credentialFormats: {
        indy: {
          attributes: credentialPreview.attributes,
          schemaIssuerDid: faberAgent.publicDid?.did,
          schemaName: schema.name,
          schemaVersion: schema.version,
          schemaId: schema.id,
          issuerDid: faberAgent.publicDid?.did,
          credentialDefinitionId: credDefId,
          linkedAttachments: [
            new LinkedAttachment({
              name: 'profile_picture',
              attachment: new Attachment({
                mimeType: 'image/png',
                data: new AttachmentData({ base64: 'base64encodedpic' }),
              }),
            }),
          ],

        }
      },
      comment: "v2 propose credential test"
    }
    testLogger.test('Alice sends (v2, Indy) credential proposal to Faber')

    let credentialExchangeRecord: CredentialExchangeRecord = await aliceAgent.credentials.proposeCredential(proposeOptions)

    expect(credentialExchangeRecord.connectionId).toEqual(proposeOptions.connectionId)
    expect(credentialExchangeRecord.protocolVersion).toEqual(CredentialProtocolVersion.V2_0)
    expect(credentialExchangeRecord.state).toEqual(CredentialState.ProposalSent)
    expect(credentialExchangeRecord.role).toEqual(CredentialRole.Holder)
    expect(credentialExchangeRecord.threadId).not.toBeNull()

    testLogger.test('Faber waits for credential proposal from Alice')
    let faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: credentialExchangeRecord.threadId,
      state: CredentialState.ProposalReceived,
    })

    let options: AcceptProposalOptions = {
      connectionId: faberConnection.id,
      protocolVersion: credentialExchangeRecord.protocolVersion,
      credentialRecordId: faberCredentialRecord.id,
      comment: 'V2 Indy Offer',
      credentialFormats: {
        indy: {
          attributes: credentialPreview.attributes,
          credentialDefinitionId: credDefId,
        }
      }
    }
    testLogger.test('Faber sends credential offer to Alice')
    let acceptCredentialExchangeRecord: CredentialExchangeRecord = await faberAgent.credentials.acceptCredentialProposal(
      options)

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.OfferReceived,
    })

    expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
      createdAt: expect.any(Date),
      offerMessage: {
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/issue-credential/2.0/offer-credential',
        comment: 'V2 Indy Offer',
        credential_preview: {
          '@type': 'https://didcomm.org/issue-credential/2.0/credential-preview',
          attributes: [
            {
              name: 'name',
              'mime-type': 'text/plain',
              value: 'John',
            },
            {
              name: 'age',
              'mime-type': 'text/plain',
              value: '99',
            },
            //  {
            //   name: "profile_picture",
            //   'mime-type': "image/png",
            //   value: "hl:zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg",
            // },
          ],
        },
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })

    // -------------------------- V2 TEST END --------------------------------------------

    // // below values are not in json object
    // expect(aliceCredentialRecord.id).not.toBeNull()
    // expect(aliceCredentialRecord.getTags()).toEqual({
    //   threadId: faberCredentialRecord.threadId,
    //   connectionId: aliceCredentialRecord.connectionId,
    //   state: aliceCredentialRecord.state,
    // })
    // expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)
  })
  // testLogger.test('Alice sends credential request to Faber')
  // aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

  // testLogger.test('Faber waits for credential request from Alice')
  // faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //   threadId: aliceCredentialRecord.threadId,
  //   state: CredentialState.RequestReceived,
  // })

  // testLogger.test('Faber sends credential to Alice')
  // faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

  // testLogger.test('Alice waits for credential from Faber')
  // aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
  //   threadId: faberCredentialRecord.threadId,
  //   state: CredentialState.CredentialReceived,
  // })

  // testLogger.test('Alice sends credential ack to Faber')
  // aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

  // testLogger.test('Faber waits for credential ack from Alice')
  // faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //   threadId: faberCredentialRecord.threadId,
  //   state: CredentialState.Done,
  // })

  // expect(aliceCredentialRecord).toMatchObject({
  //   type: CredentialRecord.name,
  //   id: expect.any(String),
  //   createdAt: expect.any(Date),
  //   threadId: expect.any(String),
  //   connectionId: expect.any(String),
  //   offerMessage: expect.any(Object),
  //   requestMessage: expect.any(Object),
  //   credentialId: expect.any(String),
  //   state: CredentialState.Done,
  // })

  // expect(faberCredentialRecord).toMatchObject({
  //   type: CredentialRecord.name,
  //   id: expect.any(String),
  //   createdAt: expect.any(Date),
  //   threadId: expect.any(String),
  //   connectionId: expect.any(String),
  //   offerMessage: expect.any(Object),
  //   requestMessage: expect.any(Object),
  //   state: CredentialState.Done,
  // })



})

  // @TODO MOVE TO NEW V2 TEST
  // test('Alice starts with credential proposal, with attachments, to Faber', async () => {
  //   testLogger.test('Alice sends credential proposal to Faber')
  //   let aliceCredentialRecord = await aliceAgent.credentials.proposeCredential(aliceConnection.id, {
  //     credentialProposal: credentialPreview,
  //     credentialDefinitionId: credDefId,
  //     linkedAttachments: [
  //       new LinkedAttachment({
  //         name: 'profile_picture',
  //         attachment: new Attachment({
  //           mimeType: 'image/png',
  //           data: new AttachmentData({ base64: 'base64encodedpic' }),
  //         }),
  //       }),
  //     ],
  //   })

  //   testLogger.test('Faber waits for credential proposal from Alice')
  //   let faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //     threadId: aliceCredentialRecord.threadId,
  //     state: CredentialState.ProposalReceived,
  //   })

  //   testLogger.test('Faber sends credential offer to Alice')
  //   faberCredentialRecord = await faberAgent.credentials.acceptProposal(faberCredentialRecord.id, {
  //     comment: 'some comment about credential',
  //   })

  //   testLogger.test('Alice waits for credential offer from Faber')
  //   aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
  //     threadId: faberCredentialRecord.threadId,
  //     state: CredentialState.OfferReceived,
  //   })

  //   expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
  //     createdAt: expect.any(Date),
  //     offerMessage: {
  //       '@id': expect.any(String),
  //       '@type': 'https://didcomm.org/issue-credential/1.0/offer-credential',
  //       comment: 'some comment about credential',
  //       credential_preview: {
  //         '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
  //         attributes: [
  //           {
  //             name: 'name',
  //             'mime-type': 'text/plain',
  //             value: 'John',
  //           },
  //           {
  //             name: 'age',
  //             'mime-type': 'text/plain',
  //             value: '99',
  //           },
  //           {
  //             name: 'profile_picture',
  //             'mime-type': 'image/png',
  //             value: 'hl:zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg',
  //           },
  //         ],
  //       },
  //       '~attach': [{ '@id': 'zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg' }],
  //       'offers~attach': expect.any(Array),
  //     },
  //     state: CredentialState.OfferReceived,
  //   })

  //   // below values are not in json object
  //   expect(aliceCredentialRecord.id).not.toBeNull()
  //   expect(aliceCredentialRecord.getTags()).toEqual({
  //     state: aliceCredentialRecord.state,
  //     threadId: faberCredentialRecord.threadId,
  //     connectionId: aliceCredentialRecord.connectionId,
  //   })
  //   expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

  //   testLogger.test('Alice sends credential request to Faber')
  //   aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

  //   testLogger.test('Faber waits for credential request from Alice')
  //   faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //     threadId: aliceCredentialRecord.threadId,
  //     state: CredentialState.RequestReceived,
  //   })

  //   testLogger.test('Faber sends credential to Alice')
  //   faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

  //   testLogger.test('Alice waits for credential from Faber')
  //   aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
  //     threadId: faberCredentialRecord.threadId,
  //     state: CredentialState.CredentialReceived,
  //   })

  //   testLogger.test('Alice sends credential ack to Faber')
  //   aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

  //   testLogger.test('Faber waits for credential ack from Alice')
  //   faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
  //     threadId: faberCredentialRecord.threadId,
  //     state: CredentialState.Done,
  //   })

  //   expect(aliceCredentialRecord).toMatchObject({
  //     type: CredentialRecord.name,
  //     id: expect.any(String),
  //     createdAt: expect.any(Date),
  //     metadata: expect.any(Object),
  //     offerMessage: expect.any(Object),
  //     requestMessage: expect.any(Object),
  //     credentialId: expect.any(String),
  //     state: CredentialState.Done,
  //   })

  //   expect(faberCredentialRecord).toMatchObject({
  //     type: CredentialRecord.name,
  //     id: expect.any(String),
  //     createdAt: expect.any(Date),
  //     metadata: expect.any(Object),
  //     offerMessage: expect.any(Object),
  //     requestMessage: expect.any(Object),
  //     state: CredentialState.Done,
  //   })
  // })

// })
